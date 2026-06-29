/**
 * Firebase Initializer for SCube
 * Configured with live Firebase details. Exposes Firestore and Auth globally.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyABFpdU9QSnWm_ZKoVC-_fFZ4LoBFCqrG4",
  authDomain: "scubecom.firebaseapp.com",
  projectId: "scubecom",
  storageBucket: "scubecom.firebasestorage.app",
  messagingSenderId: "161628103474",
  appId: "1:161628103474:web:151cf799bafbd79047ad2b",
  measurementId: "G-QL55JKHY9R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Expose Core Services
window.fbAuth = auth;
window.firestoreDb = db;

// Session Utility Functions
const ADMIN_EMAILS = ['thescubeofficial@gmail.com', 'akshithreddyworld2020@gmail.com'];
function isAdminEmail(email) {
  return email ? ADMIN_EMAILS.includes(email.trim().toLowerCase()) : false;
}

function getSession() {
  const sessionStr = localStorage.getItem('s3_session');
  if (!sessionStr) return null;
  try {
    return JSON.parse(sessionStr);
  } catch (e) {
    return null;
  }
}

function setSession(user) {
  localStorage.setItem('s3_session', JSON.stringify(user));
  localStorage.setItem('s3_signed_in', 'true');
}

function clearSession() {
  localStorage.removeItem('s3_session');
  localStorage.removeItem('s3_signed_in');
}

// Attach Session Utilities globally
window.getSession = getSession;
window.setSession = setSession;
window.clearSession = clearSession;
window.isAdminEmail = isAdminEmail;

/**
 * Initiates Google Sign-in popup using Firebase Auth
 */
function handleGoogleSignIn(role) {
  // If role is not provided, try to detect or default to 'student'
  if (!role) {
    role = window.location.pathname.includes('business.html') ? 'business' : 'student';
  }
  
  closeSignInModal();

  localStorage.setItem('s3_session_role', role);
  
  signInWithPopup(auth, provider)
    .then((result) => {
      const user = result.user;
      const sessionUser = {
        name: user.displayName || "Google User",
        email: user.email,
        photoURL: user.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?fit=facearea&facepad=2&w=80&h=80&q=80",
        role: role
      };
      setSession(sessionUser);
      updateAuthUI();
      if (typeof onAuthSuccess === 'function') {
        onAuthSuccess(sessionUser);
      }
    })
    .catch((error) => {
      console.error("Firebase Sign-In Error:", error);
      alert("Firebase Sign-In failed: " + error.message);
    });
}

/**
 * Handles simulated login popup fallback
 */
async function checkUserRestrictions(email, role) {
  if (isAdminEmail(email)) return false; // Admin is never blocked
  try {
    if (role === 'student' && window.getStudentByEmail) {
      const p = await window.getStudentByEmail(email);
      return p && (p.blocked || p.banned || p.status === 'Banned' || p.status === 'Blocked');
    } else if (role === 'business' && window.getBusinessByEmail) {
      const p = await window.getBusinessByEmail(email);
      return p && (p.blocked || p.banned || p.status === 'Banned' || p.status === 'Blocked');
    }
  } catch (e) {
    console.error("Error checking user restrictions:", e);
  }
  return false;
}



/**
 * Handle Sign Out flow
 */
function handleSignOut() {
  signOut(auth)
    .then(() => {
      clearSession();
      localStorage.removeItem('s3_session_role');
      updateAuthUI();
      if (typeof onAuthSignOut === 'function') {
        onAuthSignOut();
      }
    })
    .catch((error) => {
      console.error("Firebase Sign Out Error:", error);
      // Even if Firebase fails (offline/file://), clear local cache
      clearSession();
      localStorage.removeItem('s3_session_role');
      updateAuthUI();
      if (typeof onAuthSignOut === 'function') {
        onAuthSignOut();
      }
    });
}

function openSignInModal() {
  const modal = document.getElementById('signin-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
  }
}

function closeSignInModal() {
  const modal = document.getElementById('signin-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }
}

function toggleSignOutDropdown() {
  const dropdown = document.getElementById('signout-dropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  }
}

function updateAuthUI() {
  const navBtn = document.getElementById('nav-signin-btn');
  const profileContainer = document.getElementById('user-profile-container');
  const session = getSession();
  
  if (session) {
    const profilePicUrl = session.photoURL || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=80&h=80&q=80';
    const displayName = session.name || 'User Profile';
    
    const adminLink = isAdminEmail(session.email) 
      ? `<a href="admin.html" style="display:block; text-align:left; text-decoration:none; color:#ffd15c; padding:8px 12px; font-size:13px; font-family:'Inter',sans-serif; cursor:pointer; border-radius:8px; transition:background 200ms;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">Admin Panel</a>`
      : '';
      
    const profileHtml = `
      <div id="user-profile-container" class="user-profile-wrap" style="position:relative; display:inline-block; line-height:0; vertical-align:middle;">
        <img src="${profilePicUrl}" 
             alt="${displayName}" 
             id="user-profile-pic" 
             style="width:36px; height:36px; border-radius:50%; border:2px solid rgba(255,255,255,0.4); cursor:pointer; object-fit:cover; transition:transform 200ms, border-color 200ms;" 
             onclick="toggleSignOutDropdown()" 
             onmouseenter="this.style.transform='scale(1.05)'; this.style.borderColor='rgba(255,255,255,0.8)';" 
             onmouseleave="this.style.transform=''; this.style.borderColor='rgba(255,255,255,0.4)';" />
        <div id="signout-dropdown" style="display:none; position:absolute; right:0; top:42px; background:rgba(26,31,58,0.96); border:1px solid rgba(241,231,210,0.15); border-radius:12px; padding:6px; z-index:1000000; box-shadow:0 10px 30px rgba(0,0,0,0.5); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); min-width:140px;">
          ${adminLink}
          <button onclick="handleSignOut()" style="width:100%; text-align:left; background:none; border:none; color:#f1e7d2; padding:8px 12px; font-size:13px; font-family:'Inter',sans-serif; cursor:pointer; border-radius:8px; transition:background 200ms;" onmouseenter="this.style.background='rgba(255,255,255,0.08)'" onmouseleave="this.style.background='none'">Sign Out</button>
        </div>
      </div>
    `;
    
    if (navBtn) {
      navBtn.outerHTML = profileHtml;
    } else if (profileContainer) {
      profileContainer.outerHTML = profileHtml;
    }
  } else {
    if (profileContainer) {
      const isSubpage = window.location.pathname.includes('students.html') || window.location.pathname.includes('business.html');
      const btnHtml = isSubpage 
        ? `<button id="nav-signin-btn" class="nav-signup" onclick="openSignInModal()" style="background:rgba(255,255,255,0.06); color:#fff; border:1px solid rgba(255,255,255,0.25);">Sign In</button>`
        : `<button id="nav-signin-btn" class="s3-nav-btn" onclick="openSignInModal()" style="background:rgba(241,231,210,0.06); border-color:rgba(241,231,210,0.3); color:rgba(241,231,210,0.85); font-weight: 500;">Sign In</button>`;
      profileContainer.outerHTML = btnHtml;
    }
  }
}

// Close sign-out dropdown when clicking outside
window.addEventListener('click', function(e) {
  const dropdown = document.getElementById('signout-dropdown');
  const profilePic = document.getElementById('user-profile-pic');
  if (dropdown && dropdown.style.display === 'block' && e.target !== profilePic && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// Attach all functions to window
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleSignOut = handleSignOut;
window.openSignInModal = openSignInModal;
window.closeSignInModal = closeSignInModal;
window.toggleSignOutDropdown = toggleSignOutDropdown;
window.updateAuthUI = updateAuthUI;

// Setup auth listener
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      let role = localStorage.getItem('s3_session_role');
      if (!role) {
        role = window.location.pathname.includes('business.html') ? 'business' : 'student';
      }
      
      let sessionUser = {
        name: user.displayName || "Google User",
        email: user.email,
        photoURL: user.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?fit=facearea&facepad=2&w=80&h=80&q=80",
        role: role
      };

      if (isAdminEmail(user.email)) {
        sessionUser.role = 'admin';
        setSession(sessionUser);
        updateAuthUI();
        if (!window.location.pathname.includes('admin.html')) {
          window.location.href = 'admin.html';
        }
        return;
      }

      const isRestricted = await checkUserRestrictions(user.email, role);
      if (isRestricted) {
        alert("Access Denied: Your account has been banned/blocked by the admin.");
        clearSession();
        signOut(auth);
        updateAuthUI();
        if (typeof onAuthSignOut === 'function') {
          onAuthSignOut();
        }
        return;
      }

      setSession(sessionUser);
      updateAuthUI();
      if (typeof onAuthSuccess === 'function') {
        onAuthSuccess(sessionUser);
      }
    } else {
      clearSession();
      updateAuthUI();
      if (typeof onAuthSignOut === 'function') {
        onAuthSignOut();
      }
    }
  });
});

console.log("Firebase App, Auth and Firestore Initialized Successfully.");
