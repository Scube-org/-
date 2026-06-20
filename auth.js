// S³ Firebase Authentication Handler
// Please replace the config below with your actual Firebase project credentials
// You can find these in the Firebase Console: Project Settings -> General -> Your apps -> Web apps

const firebaseConfig = {
  apiKey: "AIzaSyABFpdU9QSnWm_ZKoVC-_fFZ4LoBFCqrG4",
  authDomain: "scubecom.firebaseapp.com",
  projectId: "scubecom",
  storageBucket: "scubecom.firebasestorage.app",
  messagingSenderId: "161628103474",
  appId: "1:161628103474:web:151cf799bafbd79047ad2b",
  measurementId: "G-QL55JKHY9R"
};

// Check if developer has replaced placeholders
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

// Initialize Firebase
if (isConfigured) {
  firebase.initializeApp(firebaseConfig);
} else {
  console.warn("Firebase is not configured. Please fill in your firebaseConfig credentials inside auth.js.");
}

const auth = isConfigured ? firebase.auth() : null;
let confirmationResult = null;

// Tab switcher logic
function switchAuthTab(tab) {
  const tabs = ['google', 'email', 'phone'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    if (t === tab) {
      if (btn) {
        btn.style.color = '#ffd15c';
        btn.style.borderBottomColor = '#ffd15c';
      }
      if (content) {
        content.style.display = 'flex';
      }
    } else {
      if (btn) {
        btn.style.color = 'rgba(241,231,210,0.55)';
        btn.style.borderBottomColor = 'transparent';
      }
      if (content) {
        content.style.display = 'none';
      }
    }
  });
  showAuthMessage("", false);
}

// Show feedback message in modal
function showAuthMessage(message, isError = false) {
  const msgEl = document.getElementById('auth-status-message');
  if (!msgEl) return;
  if (!message) {
    msgEl.style.display = 'none';
    return;
  }
  msgEl.style.display = 'block';
  msgEl.style.color = isError ? '#ff6b6b' : '#ffd15c';
  msgEl.textContent = message;
}

// Open Sign In Modal
function openSignInModal() {
  if (!isConfigured) {
    alert("Firebase is not configured yet. Please open auth.js and paste your Firebase Web App configuration credentials.");
    return;
  }
  const modal = document.getElementById('signin-modal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
    // Initialize reCAPTCHA invisibly on open
    initRecaptcha();
  }
}

// Close Sign In Modal
function closeSignInModal() {
  const modal = document.getElementById('signin-modal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => { 
      modal.style.display = 'none'; 
      resetPhoneAuthStep();
      showAuthMessage("", false);
    }, 300);
  }
}

// Google Sign-In
function handleGoogleSignIn() {
  if (!auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  showAuthMessage("Opening Google Sign-In...");
  auth.signInWithPopup(provider)
    .then((result) => {
      closeSignInModal();
    })
    .catch((error) => {
      console.error("Google Sign-In Error:", error);
      showAuthMessage(error.message, true);
    });
}

// Magic Link Sign-In
function handleSendEmailLink() {
  if (!auth) return;
  const emailInput = document.getElementById('signin-email');
  const email = emailInput ? emailInput.value.trim() : "";
  if (!email) {
    showAuthMessage("Please enter a valid email address.", true);
    return;
  }

  const actionCodeSettings = {
    url: window.location.href.split('?')[0].split('#')[0], // Redirect back to this page (clean URI)
    handleCodeInApp: true
  };

  showAuthMessage("Sending Magic Link...");
  auth.sendSignInLinkToEmail(email, actionCodeSettings)
    .then(() => {
      // Save the email locally so we don't have to ask for it again
      window.localStorage.setItem('emailForSignIn', email);
      showAuthMessage("Magic Link sent! Please check your email inbox to sign in.", false);
      if (emailInput) emailInput.value = "";
    })
    .catch((error) => {
      console.error("Magic Link Error:", error);
      showAuthMessage(error.message, true);
    });
}

// Initialize reCAPTCHA for Phone Sign-In
function initRecaptcha() {
  if (!auth) return;
  
  // Re-create recaptcha container element to prevent "reCAPTCHA has already been rendered" error
  let container = document.getElementById('recaptcha-container');
  if (container) {
    const parent = container.parentElement;
    parent.removeChild(container);
    container = document.createElement('div');
    container.id = 'recaptcha-container';
    parent.appendChild(container);
  }

  try {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: (response) => {
        // reCAPTCHA solved, will trigger sign in
      }
    });
  } catch (error) {
    console.error("reCAPTCHA setup error:", error);
  }
}

// Phone Sign-In: Send OTP
function handleSendOTP() {
  if (!auth) return;
  const phoneInput = document.getElementById('signin-phone');
  const phoneNumber = phoneInput ? phoneInput.value.trim() : "";
  if (!phoneNumber) {
    showAuthMessage("Please enter your phone number with country code (e.g. +919876543210).", true);
    return;
  }
  if (!phoneNumber.startsWith('+')) {
    showAuthMessage("Please include your country code starting with '+' (e.g., +919876543210).", true);
    return;
  }

  showAuthMessage("Sending OTP...");
  initRecaptcha();

  auth.signInWithPhoneNumber(phoneNumber, window.recaptchaVerifier)
    .then((result) => {
      confirmationResult = result;
      document.getElementById('phone-input-step').style.display = 'none';
      document.getElementById('phone-verify-step').style.display = 'flex';
      showAuthMessage("OTP Sent! Please check your messages.", false);
    })
    .catch((error) => {
      console.error("Phone Auth Send Error:", error);
      showAuthMessage(error.message, true);
      // Reset recaptcha verifier on failure so user can retry
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    });
}

// Phone Sign-In: Verify OTP
function handleVerifyOTP() {
  if (!confirmationResult) {
    showAuthMessage("Session expired. Please request a new OTP.", true);
    resetPhoneAuthStep();
    return;
  }
  const otpInput = document.getElementById('signin-otp');
  const code = otpInput ? otpInput.value.trim() : "";
  if (!code || code.length !== 6) {
    showAuthMessage("Please enter a valid 6-digit OTP code.", true);
    return;
  }

  showAuthMessage("Verifying OTP...");
  confirmationResult.confirm(code)
    .then((result) => {
      closeSignInModal();
    })
    .catch((error) => {
      console.error("Phone Auth Verification Error:", error);
      showAuthMessage(error.message, true);
    });
}

// Reset Phone Form
function resetPhoneAuthStep() {
  document.getElementById('phone-input-step').style.display = 'flex';
  document.getElementById('phone-verify-step').style.display = 'none';
  const otpInput = document.getElementById('signin-otp');
  if (otpInput) otpInput.value = "";
}

// Sign Out
function handleSignOut() {
  if (!auth) return;
  auth.signOut().then(() => {
    // Dropdown will close automatically
  }).catch((error) => {
    console.error("Sign Out Error:", error);
  });
}

// Toggle Profile Dropdown
function toggleSignOutDropdown() {
  const dropdown = document.getElementById('signout-dropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  }
}

// Update authentication UI dynamically
function updateAuthUI(user) {
  const navBtn = document.getElementById('nav-signin-btn');
  const profileContainer = document.getElementById('user-profile-container');
  
  if (user) {
    const photoURL = user.photoURL || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=80&h=80&q=80";
    const displayName = user.displayName || user.email || user.phoneNumber || "User";
    
    // Determine page-specific styling
    const isSubpage = window.location.pathname.includes('students.html') || window.location.pathname.includes('business.html');
    const borderColor = isSubpage ? 'rgba(255,255,255,0.4)' : 'rgba(241,231,210,0.4)';
    const borderHoverColor = isSubpage ? 'rgba(255,255,255,0.8)' : 'rgba(241,231,210,0.8)';
    
    const profileHtml = `
      <div id="user-profile-container" class="user-profile-wrap" style="position:relative; display:inline-block; line-height:0; vertical-align:middle;">
        <img src="${photoURL}" 
             alt="${displayName}" 
             id="user-profile-pic" 
             style="width:36px; height:36px; border-radius:50%; border:2px solid ${borderColor}; cursor:pointer; object-fit:cover; transition:transform 200ms, border-color 200ms;" 
             onclick="toggleSignOutDropdown()" 
             onmouseenter="this.style.transform='scale(1.05)'; this.style.borderColor='${borderHoverColor}';" 
             onmouseleave="this.style.transform=''; this.style.borderColor='${borderColor}';" />
        <div id="signout-dropdown" style="display:none; position:absolute; right:0; top:42px; background:rgba(26,31,58,0.96); border:1px solid rgba(241,231,210,0.15); border-radius:12px; padding:6px; z-index:1000000; box-shadow:0 10px 30px rgba(0,0,0,0.5); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); min-width:140px;">
          <div style="padding:6px 12px; font-size:11px; color:rgba(241,231,210,0.5); font-family:'Inter',sans-serif; border-bottom:1px solid rgba(241,231,210,0.1); margin-bottom:4px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${displayName}
          </div>
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
    // User is signed out, restore sign in button
    if (profileContainer) {
      const isSubpage = window.location.pathname.includes('students.html') || window.location.pathname.includes('business.html');
      const btnHtml = isSubpage 
        ? `<button id="nav-signin-btn" class="nav-signup" onclick="openSignInModal()" style="background:rgba(255,255,255,0.06); color:#fff; border:1px solid rgba(255,255,255,0.25);">Sign In</button>`
        : `<button id="nav-signin-btn" class="s3-nav-btn" onclick="openSignInModal()" style="background:rgba(241,231,210,0.06); border-color:rgba(241,231,210,0.3); color:rgba(241,231,210,0.85); font-weight: 500;">Sign In</button>`;
      profileContainer.outerHTML = btnHtml;
    }
  }
}

// Listen to Auth State Changes
if (auth) {
  auth.onAuthStateChanged((user) => {
    updateAuthUI(user);
  });

  // Handle incoming Magic Link authentication redirect
  if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = window.prompt('Please enter your email to confirm sign-in:');
    }
    if (email) {
      auth.signInWithEmailLink(email, window.location.href)
        .then((result) => {
          window.localStorage.removeItem('emailForSignIn');
          // Clear query params from the URL cleanly
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((error) => {
          console.error("Magic Link verification failed:", error);
          alert("Could not sign in: " + error.message);
        });
    }
  }
}

// Close profile dropdown when clicking outside
window.addEventListener('click', function(e) {
  const dropdown = document.getElementById('signout-dropdown');
  const profilePic = document.getElementById('user-profile-pic');
  if (dropdown && dropdown.style.display === 'block' && e.target !== profilePic && !dropdown.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});
