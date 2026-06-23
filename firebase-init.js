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

/**
 * Initiates Google Sign-in popup (with Simulator Fallback for file:// protocol)
 */
function handleGoogleSignIn(role) {
  // If role is not provided, try to detect or default to 'student'
  if (!role) {
    role = window.location.pathname.includes('business.html') ? 'business' : 'student';
  }
  
  closeSignInModal();

  if (window.location.protocol === 'file:') {
    console.log("Running on file:// protocol. Using Google Auth Simulator fallback.");
    runMockAuthOverlay(role);
    return;
  }

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
function runMockAuthOverlay(role) {
  const overlay = document.createElement('div');
  overlay.id = 'google-auth-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999999;
    background: rgba(13,15,26,0.6); backdrop-filter: blur(16px);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: #ffffff; border-radius: 24px; padding: 40px;
    width: min(440px, 90%); box-shadow: 0 20px 60px rgba(0,0,0,0.35);
    text-align: center; border: 1px solid rgba(0, 0, 0, 0.08); color: #202124;
  `;

  const accounts = role === 'student' ? [
    { name: "Aarav Mehta", email: "aarav.mehta@gmail.com", pic: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?fit=facearea&facepad=2&w=80&h=80&q=80" },
    { name: "Jane Doe", email: "jane.doe@gmail.com", pic: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?fit=facearea&facepad=2&w=80&h=80&q=80" }
  ] : [
    { name: "A.R. Founders", email: "ventures@arfounders.com", pic: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?fit=facearea&facepad=2&w=80&h=80&q=80" },
    { name: "Hyderabad Tech Hub", email: "hr@hydtechhub.in", pic: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?fit=facearea&facepad=2&w=80&h=80&q=80" }
  ];

  let accountsHtml = accounts.map((acc, index) => `
    <div class="google-acc-row" onclick="selectGoogleAccount(${index}, '${role}')" style="display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 12px; border: 1px solid #dadce0; margin-bottom: 12px; cursor: pointer; transition: background 200ms;" onmouseenter="this.style.background='#f8f9fa'" onmouseleave="this.style.background='none'">
      <img src="${acc.pic}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;" />
      <div style="text-align: left;">
        <div style="font-size: 14px; font-weight: 600; color: #3c4043;">${acc.name}</div>
        <div style="font-size: 12px; color: #5f6368;">${acc.email}</div>
      </div>
    </div>
  `).join("");

  panel.innerHTML = `
    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" style="width: 42px; margin-bottom: 16px;" alt="Google Logo" />
    <h2 style="font-size: 22px; font-weight: 500; margin-bottom: 8px; color: #202124;">Sign in with Google (Preview)</h2>
    <p style="font-size: 13px; color: #5f6368; margin-bottom: 24px;">to continue to <strong>SCube ${role === 'student' ? 'Students' : 'Business'}</strong></p>
    <div style="margin-bottom: 24px;">
      ${accountsHtml}
      <div class="google-acc-row" onclick="selectGoogleAccount(-1, '${role}')" style="display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 12px; border: 1px solid #dadce0; cursor: pointer; transition: background 200ms;" onmouseenter="this.style.background='#f8f9fa'" onmouseleave="this.style.background='none'">
        <div style="width: 38px; height: 38px; border-radius: 50%; background: #f1f3f4; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #5f6368;">+</div>
        <div style="text-align: left;">
          <div style="font-size: 14px; font-weight: 600; color: #3c4043;">Use another account</div>
        </div>
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #70757a;">
      <span>English (United States)</span>
      <button onclick="closeGoogleAuth()" style="border: none; background: none; font-size: 13px; font-weight: 600; color: #1a73e8; cursor: pointer;">Cancel</button>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  window.selectGoogleAccount = function(index, authRole) {
    let sessionUser;
    if (index === -1) {
      const name = prompt("Enter dummy name:", authRole === 'student' ? "Sai Kiran" : "Delta Internships");
      if (!name) { closeGoogleAuth(); return; }
      const email = prompt("Enter dummy email:", `${name.toLowerCase().replace(/\s/g, '')}@gmail.com`);
      if (!email) { closeGoogleAuth(); return; }
      sessionUser = {
        name: name,
        email: email,
        photoURL: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?fit=facearea&facepad=2&w=80&h=80&q=80",
        role: authRole
      };
    } else {
      sessionUser = {
        name: accounts[index].name,
        email: accounts[index].email,
        photoURL: accounts[index].pic,
        role: authRole
      };
    }

    setSession(sessionUser);
    closeGoogleAuth();
    updateAuthUI();

    if (typeof onAuthSuccess === 'function') {
      onAuthSuccess(sessionUser);
    }
  };

  window.closeGoogleAuth = function() {
    const el = document.getElementById('google-auth-overlay');
    if (el) el.remove();
  };
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
    
    const profileHtml = `
      <div id="user-profile-container" class="user-profile-wrap" style="position:relative; display:inline-block; line-height:0; vertical-align:middle;">
        <img src="${profilePicUrl}" 
             alt="${displayName}" 
             id="user-profile-pic" 
             style="width:36px; height:36px; border-radius:50%; border:2px solid rgba(255,255,255,0.4); cursor:pointer; object-fit:cover; transition:transform 200ms, border-color 200ms;" 
             onclick="toggleSignOutDropdown()" 
             onmouseenter="this.style.transform='scale(1.05)'; this.style.borderColor='rgba(255,255,255,0.8)';" 
             onmouseleave="this.style.transform=''; this.style.borderColor='rgba(255,255,255,0.4)';" />
        <div id="signout-dropdown" style="display:none; position:absolute; right:0; top:42px; background:rgba(26,31,58,0.96); border:1px solid rgba(241,231,210,0.15); border-radius:12px; padding:6px; z-index:1000000; box-shadow:0 10px 30px rgba(0,0,0,0.5); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); min-width:120px;">
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
  onAuthStateChanged(auth, (user) => {
    if (user) {
      let role = localStorage.getItem('s3_session_role');
      if (!role) {
        role = window.location.pathname.includes('business.html') ? 'business' : 'student';
      }
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
    } else {
      // Fallback check: If simulator has a session set, don't clear it
      const session = getSession();
      if (session) {
        updateAuthUI();
        if (typeof onAuthSuccess === 'function') {
          onAuthSuccess(session);
        }
      } else {
        clearSession();
        updateAuthUI();
        if (typeof onAuthSignOut === 'function') {
          onAuthSignOut();
        }
      }
    }
  });
});

console.log("Firebase App, Auth and Firestore Initialized Successfully.");
