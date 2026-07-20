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
  deleteDoc
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

async function saveStudentProfile(email, profile) {
  const db = getFirestoreDb();
  const docRef = doc(db, "students", email);
  await setDoc(docRef, profile, { merge: true });
  return profile;
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

async function saveBusinessProfile(email, profile) {
  const db = getFirestoreDb();
  const docRef = doc(db, "businesses", email);
  await setDoc(docRef, profile, { merge: true });
  return profile;
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

// Export to Global Window Context
window.SKILLS_LIST = SKILLS_LIST;
window.getStudents = getStudents;
window.getStudentByEmail = getStudentByEmail;
window.getStudentById = getStudentById;
window.saveStudentProfile = saveStudentProfile;
window.getInternships = getInternships;
window.postInternship = postInternship;
window.applyToInternship = applyToInternship;
window.getStudentHistory = getStudentHistory;
window.claimStudentByBusiness = claimStudentByBusiness;
window.setStudentStatusByBusiness = setStudentStatusByBusiness;
window.releaseStudentByBusiness = releaseStudentByBusiness;

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

