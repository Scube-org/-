/**
 * SCube Firestore Database Module
 * Replaces local-db.js with a direct Firebase Firestore connection.
 */
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where,
  deleteDoc,
  increment
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Define the 10 professional skills
const SKILLS_LIST = [
  "Software Development",
  "Digital Marketing",
  "Graphic Design",
  "UI/UX Design",
  "Content Writing",
  "Social Media Management",
  "Data Analytics",
  "Sales & Business Development",
  "Video Editing",
  "Product Management"
];

// Helper to get active firestore db instance
const getFirestoreDb = () => {
  if (!window.firestoreDb) {
    throw new Error("Firestore DB is not initialized. Please ensure firebase-init.js loads first.");
  }
  return window.firestoreDb;
};

// Generic retry helper for firestore calls to handle initialization / auth propagation delays
async function retryFirestoreCall(fn, retries = 3, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Firestore call failed (attempt ${i + 1}/${retries}), retrying in ${delay}ms...`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Database Query Helpers
async function getStudents() {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, "students"));
    const list = [];
    snap.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list;
  });
}

async function getStudentByEmail(email) {
  if (!email) return null;
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const docRef = doc(db, "students", email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  });
}

async function getStudentById(id) {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const q = query(collection(db, "students"), where("id", "==", id));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data();
    }
    return null;
  });
}

async function saveStudentProfile(email, profile, options = {}) {
  const db = getFirestoreDb();
  const docRef = doc(db, "students", email);
  const docSnap = await getDoc(docRef);
  const exists = docSnap.exists();
  
  // 1. Cross-role check: prevent registering as student if email is registered as Business
  const bizSnap = await getDoc(doc(db, "businesses", email));
  if (bizSnap.exists()) {
    throw new Error("Registration Failed: The email '" + email + "' is already registered as a Business account. A single email cannot be registered under both roles.");
  }
  
  // 2. Duplicate check for new student registration
  if (options.isNew && exists) {
    throw new Error("Registration Failed: A student profile with email '" + email + "' already exists.");
  }

  const existingData = exists ? docSnap.data() : {};
  const updatedProfile = {
    verificationStatus: existingData.verificationStatus || profile.verificationStatus || "Pending",
    ...profile
  };
  await setDoc(docRef, updatedProfile, { merge: true });
  return updatedProfile;
}

async function verifyStudent(email, status = "Verified") {
  const db = getFirestoreDb();
  const docRef = doc(db, "students", email);
  await updateDoc(docRef, { verificationStatus: status });
  return true;
}

async function getInternships() {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, "internships"));
    const list = [];
    snap.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list;
  });
}

async function postInternship(companyName, details) {
  const db = getFirestoreDb();
  const newDocRef = doc(collection(db, "internships"));
  const newInt = {
    id: newDocRef.id,
    companyName: companyName,
    title: details.title,
    skill: details.skill,
    preference: details.preference,
    duration: details.duration,
    description: details.description,
    requirements: details.requirements
  };
  await setDoc(newDocRef, newInt);
  return newInt;
}

async function applyToInternship(studentEmail, internshipId) {
  const db = getFirestoreDb();
  
  // Find internship
  const intDocRef = doc(db, "internships", internshipId);
  const intSnap = await getDoc(intDocRef);
  if (!intSnap.exists()) return { success: false, message: "Internship not found" };
  const internship = intSnap.data();
  
  // Find student
  const student = await getStudentByEmail(studentEmail);
  if (!student) return { success: false, message: "Student profile not found. Please complete the form first." };
  
  // Prevent duplicate active applications
  const q = query(
    collection(db, "applications"), 
    where("studentEmail", "==", studentEmail), 
    where("internshipId", "==", internshipId)
  );
  const appSnap = await getDocs(q);
  if (!appSnap.empty) return { success: false, message: "You have already applied to this internship." };
  
  // Create application
  const appDocRef = doc(collection(db, "applications"));
  const app = {
    id: appDocRef.id,
    studentEmail: studentEmail,
    internshipId: internshipId,
    status: "Applied",
    appliedAt: new Date().toLocaleDateString()
  };
  await setDoc(appDocRef, app);
  
  // Update student profile status and claimedBy
  await saveStudentProfile(studentEmail, {
    status: "Applied",
    claimedBy: internship.companyName
  });
  
  return { success: true, application: app };
}

async function getStudentHistory(studentEmail) {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const q = query(collection(db, "applications"), where("studentEmail", "==", studentEmail));
    const snap = await getDocs(q);
    const studentApps = [];
    snap.forEach(docSnap => {
      studentApps.push(docSnap.data());
    });
    
    // Fetch internships to map details
    const internships = await getInternships();
    const internshipMap = {};
    internships.forEach(i => {
      internshipMap[i.id] = i;
    });
    
    return studentApps.map(app => {
      const internship = internshipMap[app.internshipId];
      return {
        ...app,
        title: internship ? internship.title : "Direct Placement",
        companyName: internship ? internship.companyName : (app.companyName || "Unknown Company"),
        description: internship ? internship.description : "Direct placement by company.",
        requirements: internship ? internship.requirements : "Flexible.",
        duration: internship ? internship.duration : "Flexible",
        preference: internship ? internship.preference : "Hybrid"
      };
    });
  });
}

async function claimStudentByBusiness(studentId, companyName, initialStatus) {
  const db = getFirestoreDb();
  const student = await getStudentById(studentId);
  if (!student) return false;
  
  await saveStudentProfile(student.email, {
    claimedBy: companyName,
    status: initialStatus
  });
  
  // Query active applications of this student
  const q = query(collection(db, "applications"), where("studentEmail", "==", student.email));
  const appsSnap = await getDocs(q);
  const studentApps = [];
  appsSnap.forEach(docSnap => {
    studentApps.push({ docId: docSnap.id, ...docSnap.data() });
  });
  
  // Fetch recruiter's active internships
  const internships = await getInternships();
  const companyIntIds = internships.filter(i => i.companyName === companyName).map(i => i.id);
  
  const existingApp = studentApps.find(a => companyIntIds.includes(a.internshipId));
  if (existingApp) {
    const appRef = doc(db, "applications", existingApp.docId);
    await updateDoc(appRef, { status: initialStatus });
  } else {
    // If no specific internship applied, look for or create a "Direct Placement" internship model
    const qInt = query(
      collection(db, "internships"), 
      where("companyName", "==", companyName), 
      where("title", "==", "Direct Placement")
    );
    const directInts = await getDocs(qInt);
    let customIntId;
    if (directInts.empty) {
      const newIntRef = doc(collection(db, "internships"));
      customIntId = newIntRef.id;
      await setDoc(newIntRef, {
        id: customIntId,
        companyName: companyName,
        title: "Direct Placement",
        skill: student.skill,
        preference: student.preference,
        duration: "Flexible",
        description: "Direct claim opportunity by the founder.",
        requirements: "Determined by recruiter."
      });
    } else {
      customIntId = directInts.docs[0].id;
    }
    
    const newAppRef = doc(collection(db, "applications"));
    await setDoc(newAppRef, {
      id: newAppRef.id,
      studentEmail: student.email,
      internshipId: customIntId,
      status: initialStatus,
      appliedAt: new Date().toLocaleDateString()
    });
  }
  return true;
}

async function setStudentStatusByBusiness(studentId, status) {
  const db = getFirestoreDb();
  const student = await getStudentById(studentId);
  if (!student) return false;
  
  await saveStudentProfile(student.email, { status: status });
  
  // Query active applications of this student
  const q = query(collection(db, "applications"), where("studentEmail", "==", student.email));
  const appsSnap = await getDocs(q);
  const studentApps = [];
  appsSnap.forEach(docSnap => {
    studentApps.push({ docId: docSnap.id, ...docSnap.data() });
  });
  
  const internships = await getInternships();
  const companyIntIds = internships.filter(i => i.companyName === student.claimedBy).map(i => i.id);
  const app = studentApps.find(a => companyIntIds.includes(a.internshipId));
  
  if (app) {
    const appRef = doc(db, "applications", app.docId);
    await updateDoc(appRef, { status: status });
  }
  return true;
}

async function releaseStudentByBusiness(studentId) {
  const db = getFirestoreDb();
  const student = await getStudentById(studentId);
  if (!student) return false;
  
  const internships = await getInternships();
  const companyIntIds = internships.filter(i => i.companyName === student.claimedBy).map(i => i.id);
  
  // Update active applications (not Completed) to Completed
  const q = query(collection(db, "applications"), where("studentEmail", "==", student.email));
  const appsSnap = await getDocs(q);
  
  const promises = [];
  appsSnap.forEach(docSnap => {
    const app = docSnap.data();
    if (companyIntIds.includes(app.internshipId) && app.status !== "Completed") {
      promises.push(updateDoc(doc(db, "applications", docSnap.id), { status: "Completed" }));
    }
  });
  await Promise.all(promises);
  
  // Release student details
  await saveStudentProfile(student.email, {
    claimedBy: null,
    status: "Available"
  });
  
  return true;
}

// Business Database Query Helpers
async function getBusinesses() {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, "businesses"));
    const list = [];
    snap.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list;
  });
}

async function getBusinessByEmail(email) {
  if (!email) return null;
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const docRef = doc(db, "businesses", email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  });
}

async function saveBusinessProfile(email, profile, options = {}) {
  const db = getFirestoreDb();
  const docRef = doc(db, "businesses", email);
  const docSnap = await getDoc(docRef);
  const exists = docSnap.exists();
  
  // 1. Cross-role check: prevent registering as business if email is registered as Student
  const studSnap = await getDoc(doc(db, "students", email));
  if (studSnap.exists()) {
    throw new Error("Registration Failed: The email '" + email + "' is already registered as a Student account. A single email cannot be registered under both roles.");
  }
  
  // 2. Duplicate check for new business registration
  if (options.isNew && exists) {
    throw new Error("Registration Failed: A business profile with email '" + email + "' already exists.");
  }

  const existingData = exists ? docSnap.data() : {};
  const updatedProfile = {
    verificationStatus: existingData.verificationStatus || profile.verificationStatus || "Pending",
    ...profile
  };
  await setDoc(docRef, updatedProfile, { merge: true });
  return updatedProfile;
}

async function verifyBusiness(email, status = "Verified") {
  const db = getFirestoreDb();
  const docRef = doc(db, "businesses", email);
  await updateDoc(docRef, { verificationStatus: status });
  return true;
}

// Hire Request & Placement Approval Helpers
async function requestHireStudent(studentId, companyName, businessEmail) {
  const db = getFirestoreDb();
  const student = await getStudentById(studentId);
  if (!student) return { success: false, message: "Student profile not found" };
  
  const newDocRef = doc(collection(db, "hire_requests"));
  const hireReq = {
    id: newDocRef.id,
    studentId: studentId,
    studentEmail: student.email,
    studentName: student.name || student.email,
    businessEmail: businessEmail,
    companyName: companyName,
    status: "Pending Admin Approval",
    requestedAt: new Date().toLocaleDateString()
  };
  await setDoc(newDocRef, hireReq);
  
  // Mark student status as Hire Pending
  await saveStudentProfile(student.email, {
    status: "Hire Pending Approval"
  });
  
  return { success: true, request: hireReq };
}

async function getHireRequests() {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, "hire_requests"));
    const list = [];
    snap.forEach(docSnap => list.push(docSnap.data()));
    return list;
  });
}

async function approveHireRequest(requestId) {
  const db = getFirestoreDb();
  const reqRef = doc(db, "hire_requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return false;
  
  const reqData = reqSnap.data();
  await updateDoc(reqRef, { status: "Approved" });
  
  // Activate placement on student record
  await claimStudentByBusiness(reqData.studentId, reqData.companyName, "Active");
  return true;
}

async function rejectHireRequest(requestId) {
  const db = getFirestoreDb();
  const reqRef = doc(db, "hire_requests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return false;
  
  const reqData = reqSnap.data();
  await updateDoc(reqRef, { status: "Rejected" });
  
  // Release student status back to Available
  await saveStudentProfile(reqData.studentEmail, {
    status: "Available",
    claimedBy: null
  });
  return true;
}

async function deleteBusiness(email) {
  const db = getFirestoreDb();
  const docRef = doc(db, "businesses", email);
  await deleteDoc(docRef);
  return true;
}

async function deleteStudent(email) {
  const db = getFirestoreDb();
  const docRef = doc(db, "students", email);
  await deleteDoc(docRef);
  return true;
}

// Coaching Group Helpers
async function getCoachingGroups() {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, "coaching_groups"));
    const list = [];
    snap.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list;
  });
}

async function getCoachingGroupBySkill(skillName) {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const docRef = doc(db, "coaching_groups", skillName);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  });
}

async function saveCoachingGroup(skillName, groupData) {
  const db = getFirestoreDb();
  const docRef = doc(db, "coaching_groups", skillName);
  await setDoc(docRef, groupData, { merge: true });
  return groupData;
}

async function registerStudentForCoaching(studentEmail, skillName) {
  const db = getFirestoreDb();
  const docRef = doc(db, "coaching_groups", skillName);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    const studentEmails = data.studentEmails || [];
    if (!studentEmails.includes(studentEmail)) {
      studentEmails.push(studentEmail);
      await updateDoc(docRef, { studentEmails: studentEmails });
    }
  } else {
    // Group doesn't exist, create it
    await setDoc(docRef, {
      id: skillName,
      skill: skillName,
      leaderEmail: "mentor." + skillName.toLowerCase().replace(/[^a-z0-9]/g, "") + "@scube.com",
      duration: "Weekly",
      whatsappLink: "Not Set",
      studentEmails: [studentEmail]
    });
  }
  return true;
}

async function unregisterStudentFromCoaching(studentEmail, skillName) {
  const db = getFirestoreDb();
  const docRef = doc(db, "coaching_groups", skillName);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    const studentEmails = data.studentEmails || [];
    const index = studentEmails.indexOf(studentEmail);
    if (index > -1) {
      studentEmails.splice(index, 1);
      await updateDoc(docRef, { studentEmails: studentEmails });
    }
  }
  return true;
}

async function ensureCoachingGroupsSeeded() {
  try {
    const db = getFirestoreDb();
    for (const skill of SKILLS_LIST) {
      const docRef = doc(db, "coaching_groups", skill);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        const defaultLeader = "mentor." + skill.toLowerCase().replace(/[^a-z0-9]/g, "") + "@scube.com";
        await setDoc(docRef, {
          id: skill,
          skill: skill,
          leaderEmail: defaultLeader,
          duration: "Weekly",
          whatsappLink: "Not Set",
          studentEmails: []
        });
      }
    }
    console.log("Coaching groups seeded / checked successfully.");
  } catch (error) {
    console.error("Error seeding coaching groups:", error);
  }
}

// Task Helpers
async function createTask(taskData) {
  const db = getFirestoreDb();
  const newDocRef = doc(collection(db, "tasks"));
  const task = {
    id: newDocRef.id,
    businessEmail: taskData.businessEmail,
    companyName: taskData.companyName,
    studentEmail: taskData.studentEmail,
    internshipId: taskData.internshipId || "",
    title: taskData.title,
    description: taskData.description,
    status: "Assigned",
    submissionNotes: "",
    assignedAt: new Date().toLocaleDateString(),
    completedAt: null
  };
  await setDoc(newDocRef, task);
  return task;
}

async function getStudentTasks(studentEmail) {
  if (!studentEmail) return [];
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const q = query(collection(db, "tasks"), where("studentEmail", "==", studentEmail));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(docSnap => list.push(docSnap.data()));
    return list;
  });
}

async function getBusinessTasks(businessEmail) {
  if (!businessEmail) return [];
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const q = query(collection(db, "tasks"), where("businessEmail", "==", businessEmail));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(docSnap => list.push(docSnap.data()));
    return list;
  });
}

async function submitTask(taskId, submissionNotes) {
  const db = getFirestoreDb();
  const docRef = doc(db, "tasks", taskId);
  await updateDoc(docRef, {
    status: "Submitted",
    submissionNotes: submissionNotes || ""
  });
  return true;
}

async function approveTaskCompletion(taskId) {
  const db = getFirestoreDb();
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    status: "Completed",
    completedAt: new Date().toLocaleDateString()
  });
  return true;
}

// Student Reporting System Helpers
async function reportStudent(reportData) {
  const db = getFirestoreDb();
  const newRef = doc(collection(db, "reports"));
  const report = {
    id: newRef.id,
    studentEmail: reportData.studentEmail,
    studentName: reportData.studentName || reportData.studentEmail,
    businessEmail: reportData.businessEmail,
    companyName: reportData.companyName || "Business",
    reason: reportData.reason,
    status: "Active",
    createdAt: new Date().toLocaleDateString()
  };
  await setDoc(newRef, report);
  
  const studentRef = doc(db, "students", reportData.studentEmail);
  await setDoc(studentRef, {
    hasReports: true,
    reportCount: increment(1)
  }, { merge: true });
  
  return report;
}

async function getReports() {
  return retryFirestoreCall(async () => {
    const db = getFirestoreDb();
    const snap = await getDocs(collection(db, "reports"));
    const list = [];
    snap.forEach(docSnap => list.push(docSnap.data()));
    return list;
  });
}

async function dismissReport(reportId, studentEmail) {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "reports", reportId));
  
  if (studentEmail) {
    const q = query(collection(db, "reports"), where("studentEmail", "==", studentEmail));
    const snap = await getDocs(q);
    const hasRemaining = !snap.empty;
    const studentRef = doc(db, "students", studentEmail);
    await setDoc(studentRef, {
      hasReports: hasRemaining,
      reportCount: snap.size
    }, { merge: true });
  }
  return true;
}

// Export to Global Window Context
window.SKILLS_LIST = SKILLS_LIST;
window.getStudents = getStudents;
window.getStudentByEmail = getStudentByEmail;
window.getStudentById = getStudentById;
window.saveStudentProfile = saveStudentProfile;
window.verifyStudent = verifyStudent;
window.getInternships = getInternships;
window.postInternship = postInternship;
window.applyToInternship = applyToInternship;
window.getStudentHistory = getStudentHistory;
window.claimStudentByBusiness = claimStudentByBusiness;
window.setStudentStatusByBusiness = setStudentStatusByBusiness;
window.releaseStudentByBusiness = releaseStudentByBusiness;

// Verification & Placement Exports
window.verifyBusiness = verifyBusiness;
window.requestHireStudent = requestHireStudent;
window.getHireRequests = getHireRequests;
window.approveHireRequest = approveHireRequest;
window.rejectHireRequest = rejectHireRequest;

// Coaching Exports
window.getCoachingGroups = getCoachingGroups;
window.getCoachingGroupBySkill = getCoachingGroupBySkill;
window.saveCoachingGroup = saveCoachingGroup;
window.registerStudentForCoaching = registerStudentForCoaching;
window.unregisterStudentFromCoaching = unregisterStudentFromCoaching;
window.ensureCoachingGroupsSeeded = ensureCoachingGroupsSeeded;

// Admin exports
window.getBusinesses = getBusinesses;
window.getBusinessByEmail = getBusinessByEmail;
window.saveBusinessProfile = saveBusinessProfile;
window.deleteBusiness = deleteBusiness;
window.deleteStudent = deleteStudent;

// Task & Report Exports
window.createTask = createTask;
window.getStudentTasks = getStudentTasks;
window.getBusinessTasks = getBusinessTasks;
window.submitTask = submitTask;
window.approveTaskCompletion = approveTaskCompletion;
window.reportStudent = reportStudent;
window.getReports = getReports;
window.dismissReport = dismissReport;

// Execute Database Initialization
setTimeout(async () => {
  try {
    const db = getFirestoreDb();
    const seedDoc = await getDoc(doc(db, "system", "seeding"));
    const isCleaned = seedDoc.exists() && seedDoc.data().cleanedV2 === true;
    
    if (!isCleaned) {
      await ensureCoachingGroupsSeeded();
      await setDoc(doc(db, "system", "seeding"), { seeded: true, cleanedV2: true });
    }
  } catch (err) {
    console.error("Initialization trigger failed:", err);
  }
}, 300);

