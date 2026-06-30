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

// Seeding implementation
async function seedFirestoreIfEmpty() {
  const db = getFirestoreDb();
  
  // Check if we have already seeded in the past using a metadata document
  const seedRef = doc(db, "system", "seeding");
  try {
    const seedSnap = await getDoc(seedRef);
    if (seedSnap.exists() && seedSnap.data().seeded === true) {
      console.log("Firestore already seeded (verified by system configuration).");
      return;
    }
  } catch (error) {
    console.warn("Could not read system seeding status, checking collection state:", error);
  }
  
  const querySnapshot = await getDocs(collection(db, "internships"));
  if (!querySnapshot.empty) {
    console.log("Firestore already seeded with datasets. Marking system as seeded.");
    try {
      await setDoc(seedRef, { seeded: true });
    } catch (e) {
      console.error("Failed to mark system as seeded:", e);
    }
    return;
  }
  
  console.log("Seeding Firestore with default datasets...");
  
  const seedInternships = [
    {
      id: "int_1",
      companyName: "A.R. Founders",
      title: "Frontend Engineer Intern",
      skill: "Software Development",
      preference: "Remote",
      duration: "3 Months",
      description: "Work with modern web technologies to build responsive landing pages and product dashboards.",
      requirements: "Familiarity with HTML, CSS, JavaScript, and Figma prototypes."
    },
    {
      id: "int_2",
      companyName: "Hyderabad Tech Hub",
      title: "Social Media Manager",
      skill: "Digital Marketing",
      preference: "On-site",
      duration: "6 Months",
      description: "Design and execute social media campaigns for active startup founders.",
      requirements: "Basic design skills, copywriting, and passion for social media growth."
    },
    {
      id: "int_3",
      companyName: "Innovate Labs",
      title: "Junior UI/UX Designer",
      skill: "UI/UX Design",
      preference: "Hybrid",
      duration: "3 Months",
      description: "Collaborate with product developers to build outstanding visual interfaces and customer journey flows.",
      requirements: "Knowledge of Figma, responsive UI design principles, and visual branding."
    },
    {
      id: "int_4",
      companyName: "Creative Agency",
      title: "Content Writer",
      skill: "Content Writing",
      preference: "Remote",
      duration: "2 Months",
      description: "Write engaging blog posts, newsletter editions, and marketing copy.",
      requirements: "Strong English writing and editing skills, basic SEO understanding."
    }
  ];
  
  const seedStudents = [
    {
      id: "stud_1",
      name: "Aarav Mehta",
      age: 18,
      grade: "12th Pass",
      skill: "Software Development",
      experience: "Built multiple responsive landing pages using HTML/CSS/JS. Familiar with modern JavaScript frameworks.",
      school: "Chirec International School",
      email: "aarav.mehta@gmail.com",
      phone: "+91 99887 76655",
      preference: "Remote",
      status: "Available",
      claimedBy: null
    },
    {
      id: "stud_2",
      name: "Sneha Reddy",
      age: 17,
      grade: "12th Grade",
      skill: "Digital Marketing",
      experience: "Managed social media handles for the school cultural fest. Designed graphic assets and ran basic Instagram campaigns.",
      school: "Delhi Public School, Hyderabad",
      email: "sneha.reddy@gmail.com",
      phone: "+91 91234 56789",
      preference: "On-site",
      status: "Applied",
      claimedBy: "Techcorp Solutions"
    },
    {
      id: "stud_3",
      name: "Vikram Sen",
      age: 19,
      grade: "NA / Other",
      skill: "UI/UX Design",
      experience: "Designed user interfaces for three mobile app mockups in Figma. Portfolio published on Behance.",
      school: "VNR Vignana Jyothi Institute",
      email: "vikram.sen@gmail.com",
      phone: "+91 98480 12345",
      preference: "Hybrid",
      status: "Shortlisted",
      claimedBy: "Innovate Labs"
    },
    {
      id: "stud_4",
      name: "Riya Sharma",
      age: 18,
      grade: "12th Pass",
      skill: "Content Writing",
      experience: "Wrote articles and copy for school newsletter. Regularly publishes personal blog posts about tech trends.",
      school: "Oakridge International School",
      email: "riya.sharma@gmail.com",
      phone: "+91 88990 01122",
      preference: "Remote",
      status: "Completed",
      claimedBy: "Creative Agency"
    }
  ];
  
  const seedApplications = [
    {
      id: "app_1",
      studentEmail: "aarav.mehta@gmail.com",
      internshipId: "int_1",
      status: "Completed",
      appliedAt: "2026-04-10"
    },
    {
      id: "app_2",
      studentEmail: "sneha.reddy@gmail.com",
      internshipId: "int_2",
      status: "Applied",
      appliedAt: "2026-06-20"
    },
    {
      id: "app_3",
      studentEmail: "vikram.sen@gmail.com",
      internshipId: "int_3",
      status: "Shortlisted",
      appliedAt: "2026-06-18"
    },
    {
      id: "app_4",
      studentEmail: "riya.sharma@gmail.com",
      internshipId: "int_4",
      status: "Completed",
      appliedAt: "2026-05-15"
    }
  ];
  
  for (const s of seedStudents) {
    await setDoc(doc(db, "students", s.email), s);
  }
  for (const i of seedInternships) {
    await setDoc(doc(db, "internships", i.id), i);
  }
  for (const a of seedApplications) {
    await setDoc(doc(db, "applications", a.id), a);
  }

  // Seed default businesses if empty
  const seedBusinesses = [
    {
      name: "A.R. Founders",
      email: "ventures@arfounders.com",
      photoURL: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?fit=facearea&facepad=2&w=80&h=80&q=80",
      role: "business",
      blocked: false
    },
    {
      name: "Hyderabad Tech Hub",
      email: "hr@hydtechhub.in",
      photoURL: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?fit=facearea&facepad=2&w=80&h=80&q=80",
      role: "business",
      blocked: false
    }
  ];
  for (const b of seedBusinesses) {
    await setDoc(doc(db, "businesses", b.email), b);
  }
  
  try {
    await setDoc(seedRef, { seeded: true });
  } catch (e) {
    console.error("Failed to mark system as seeded after seeding:", e);
  }

  console.log("Firestore seeding completed successfully.");
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

// Admin exports
window.getBusinesses = getBusinesses;
window.getBusinessByEmail = getBusinessByEmail;
window.saveBusinessProfile = saveBusinessProfile;
window.deleteBusiness = deleteBusiness;
window.deleteStudent = deleteStudent;

// Execute Seeding Check
setTimeout(() => {
  try {
    seedFirestoreIfEmpty().catch(e => console.error("Firestore seeding failed:", e));
  } catch (err) {
    console.error("Firestore seed trigger failed:", err);
  }
}, 300);

