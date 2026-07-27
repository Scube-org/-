/**
 * SCube Debug Mode Panel
 * Provides temporary role-switching for testing purposes.
 * All changes are LOCAL and TEMPORARY — they reset on page refresh
 * because onAuthStateChanged overwrites the session with real auth state.
 * 
 * Does NOT modify any authentication logic.
 */
(function () {
  'use strict';

  const ADMIN_EMAIL = 'thescubeofficial@gmail.com';

  const ROLES = {
    student: { name: 'Debug Student', email: 'debug.student@scube.test', role: 'student', photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=DS&backgroundColor=ffd15c&textColor=1a1f3a' },
    business: { name: 'Debug Business', email: 'debug.business@scube.test', role: 'business', photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=DB&backgroundColor=7c6bf0&textColor=ffffff' },
    admin: { name: 'Debug Admin', email: ADMIN_EMAIL, role: 'admin', photoURL: 'https://api.dicebear.com/7.x/initials/svg?seed=DA&backgroundColor=ff6b6b&textColor=ffffff' }
  };

  const PAGES = [
    { label: '🏠 Home', href: 'index.html' },
    { label: '🎓 Students', href: 'students.html' },
    { label: '💼 Business', href: 'business.html' },
    { label: '⚙️ Admin', href: 'admin.html' }
  ];

  let panelOpen = false;
  let activeRole = null;
  let activeVerification = null; // 'Pending' or 'Verified'

  // ── Wait for firebase utilities before initializing ──────────────────
  function waitForUtils(cb) {
    if (window.setSession && window.updateAuthUI && window.getSession && window.clearSession) {
      cb();
    } else {
      setTimeout(function () { waitForUtils(cb); }, 150);
    }
  }

  // ── Activate a debug role ────────────────────────────────────────────
  function activateRole(role, verification) {
    var user = Object.assign({}, ROLES[role]);
    activeRole = role;
    activeVerification = verification || null;

    // Set the session (writes to localStorage; overwritten on next real auth event)
    window.setSession(user);
    localStorage.setItem('s3_session_role', role);

    // If a verification state was chosen, write a temporary profile to Firestore
    // so the page's normal logic picks it up, then reload
    if (verification && (role === 'student' || role === 'business')) {
      writeDebugProfile(role, user, verification);
      return; // writeDebugProfile will reload the page
    }

    // Update nav bar (profile pic / sign-in button)
    window.updateAuthUI();

    // Unlock page-specific UI
    unlockPage(role);

    // Update panel button states
    updatePanelButtons();
  }

  // ── Write a temporary Firestore profile with the chosen verification status ──
  function writeDebugProfile(role, user, verification) {
    var saveFn = role === 'student' ? window.saveStudentProfile : window.saveBusinessProfile;
    if (!saveFn) {
      alert('Database helpers not loaded yet. Please wait a moment and try again.');
      return;
    }

    var profile = {
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      role: role,
      verificationStatus: verification,
      status: 'Available'
    };

    if (role === 'student') {
      profile.id = 'debug_stud_' + Date.now();
      profile.age = 20;
      profile.grade = '12th';
      profile.skill = 'Software Development';
      profile.preference = 'Remote';
      profile.school = 'Debug School';
      profile.experience = 'Debug testing';
      profile.phone = '0000000000';
      profile.claimedBy = null;
    }

    saveFn(user.email, profile)
      .then(function () {
        console.log('[Debug] Profile saved with verificationStatus:', verification);
        // Store debug state so it survives the reload
        sessionStorage.setItem('s3_debug_state', JSON.stringify({
          role: role,
          verification: verification
        }));
        window.location.reload();
      })
      .catch(function (err) {
        console.error('[Debug] Failed to write profile:', err);
        alert('Debug profile write failed: ' + err.message);
      });
  }

  // ── Page-specific UI unlocking ───────────────────────────────────────
  function unlockPage(role) {
    var path = window.location.pathname;

    // ── Students page ────────────────────────────────────────────────
    if (path.includes('students.html')) {
      hide('.hero-heading');
      hide('.hero-bottom-left');
      hide('.hero-bottom-right');
      hide('#student-auth-lock-overlay');
      rmClass('#student-form-card', 'auth-blurred-content');
      overflowAuto('#student-form-section');
      show('#student-nav-pill', 'flex');

      // Show form inputs for student, show all tabs for admin
      if (role === 'admin' || role === 'student') {
        var inputsC = document.getElementById('student-form-inputs-container');
        var successC = document.getElementById('student-form-success-container');
        if (inputsC) inputsC.style.display = 'flex';
        if (successC) successC.style.display = 'none';

        // Enable all tabs
        ['btn-tab-form', 'btn-tab-finder', 'btn-tab-progress', 'btn-tab-coaching'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) { el.style.opacity = '1'; el.style.cursor = 'pointer'; }
        });
      }
    }

    // ── Business page ────────────────────────────────────────────────
    if (path.includes('business.html')) {
      hide('.hero-heading');
      hide('.hero-bottom-left');
      hide('.hero-bottom-right');
      hide('#business-auth-lock-overlay');
      rmClass('#business-sidebar', 'auth-blurred-content');
      rmClass('#business-main-panel', 'auth-blurred-content');
      var dbSection = document.getElementById('business-dashboard-section');
      if (dbSection) {
        dbSection.style.display = 'flex';
        dbSection.style.setProperty('overflow', 'auto', 'important');
      }
    }

    // ── Admin page ───────────────────────────────────────────────────
    // Admin page guards redirect non-admins before we can intervene,
    // so debug must be activated BEFORE navigating. The session with
    // admin email is enough to pass the guard on DOMContentLoaded.

    // ── Index page ───────────────────────────────────────────────────
    // Just the nav update (already done via updateAuthUI) is sufficient.
  }

  // ── DOM helpers ──────────────────────────────────────────────────────
  function hide(sel) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) el.style.display = 'none';
  }
  function show(sel, disp) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) el.style.display = disp || 'block';
  }
  function rmClass(sel, cls) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) el.classList.remove(cls);
  }
  function overflowAuto(sel) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) el.style.setProperty('overflow', 'auto', 'important');
  }

  // ── Reset debug mode ────────────────────────────────────────────────
  function resetDebug() {
    activeRole = null;
    window.location.reload();
  }

  // ── Build the floating debug panel ───────────────────────────────────
  function createPanel() {
    // Floating toggle button
    var toggle = document.createElement('button');
    toggle.id = 'debug-toggle-btn';
    toggle.innerHTML = '🛠';
    toggle.title = 'Debug Mode';
    Object.assign(toggle.style, {
      position: 'fixed', bottom: '20px', left: '20px', zIndex: '9999999',
      width: '44px', height: '44px', borderRadius: '50%',
      background: 'rgba(26,31,58,0.92)', border: '1px solid rgba(241,231,210,0.2)',
      color: '#ffd15c', fontSize: '20px', cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      transition: 'transform 200ms, box-shadow 200ms', lineHeight: '1'
    });
    toggle.addEventListener('mouseenter', function () {
      toggle.style.transform = 'scale(1.1)';
      toggle.style.boxShadow = '0 6px 28px rgba(0,0,0,0.5)';
    });
    toggle.addEventListener('mouseleave', function () {
      toggle.style.transform = '';
      toggle.style.boxShadow = '0 4px 20px rgba(0,0,0,0.4)';
    });
    toggle.addEventListener('click', function () {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
      setTimeout(function () { panel.style.opacity = panelOpen ? '1' : '0'; }, 10);
    });

    // Panel container
    var panel = document.createElement('div');
    panel.id = 'debug-panel';
    Object.assign(panel.style, {
      position: 'fixed', bottom: '72px', left: '20px', zIndex: '9999998',
      display: 'none', opacity: '0', flexDirection: 'column', gap: '10px',
      background: 'rgba(26,31,58,0.96)', border: '1px solid rgba(241,231,210,0.15)',
      borderRadius: '18px', padding: '18px 16px', minWidth: '200px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      transition: 'opacity 200ms ease', fontFamily: "'Inter', sans-serif"
    });

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin-bottom:2px;';
    header.innerHTML = '<span style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:#ffd15c;">🛠 Debug Mode</span>';
    panel.appendChild(header);

    // Divider
    panel.appendChild(makeDivider());

    // Role label
    var roleLabel = document.createElement('div');
    roleLabel.style.cssText = 'font-size:10px; text-transform:uppercase; letter-spacing:1px; color:rgba(241,231,210,0.45); font-weight:600;';
    roleLabel.textContent = 'Switch Role';
    panel.appendChild(roleLabel);

    // Role buttons
    var roleData = [
      { key: 'student', label: '🎓 Student', color: '#ffd15c' },
      { key: 'business', label: '💼 Business', color: '#7c6bf0' },
      { key: 'admin', label: '⚙️ Admin', color: '#ff6b6b' }
    ];

    roleData.forEach(function (r) {
      var btn = document.createElement('button');
      btn.id = 'debug-role-' + r.key;
      btn.textContent = r.label;
      btn.dataset.role = r.key;
      Object.assign(btn.style, {
        width: '100%', padding: '9px 14px', borderRadius: '10px',
        border: '1px solid rgba(241,231,210,0.12)', background: 'rgba(255,255,255,0.04)',
        color: '#f1e7d2', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
        textAlign: 'left', transition: 'all 180ms', fontFamily: "'Inter', sans-serif"
      });
      btn.addEventListener('mouseenter', function () {
        if (activeRole !== r.key) {
          btn.style.background = 'rgba(255,255,255,0.08)';
          btn.style.borderColor = r.color;
        }
      });
      btn.addEventListener('mouseleave', function () {
        if (activeRole !== r.key) {
          btn.style.background = 'rgba(255,255,255,0.04)';
          btn.style.borderColor = 'rgba(241,231,210,0.12)';
        }
      });
      btn.addEventListener('click', function () {
        activateRole(r.key);
      });
      panel.appendChild(btn);
    });

    // Divider
    panel.appendChild(makeDivider());

    // Verification status label
    var verifLabel = document.createElement('div');
    verifLabel.style.cssText = 'font-size:10px; text-transform:uppercase; letter-spacing:1px; color:rgba(241,231,210,0.45); font-weight:600;';
    verifLabel.textContent = 'Verification State';
    panel.appendChild(verifLabel);

    // Verification status hint
    var verifHint = document.createElement('div');
    verifHint.style.cssText = 'font-size:10px; color:rgba(241,231,210,0.3); line-height:1.4; margin-bottom:2px;';
    verifHint.textContent = 'Select role first, then pick a state. Page will auto-reload.';
    panel.appendChild(verifHint);

    // Verification buttons row
    var verifRow = document.createElement('div');
    verifRow.style.cssText = 'display:flex; gap:6px;';

    var verifBtns = [
      { key: 'Pending', label: '⏳ Pending', color: '#f0a030' },
      { key: 'Verified', label: '✅ Verified', color: '#34d399' }
    ];

    verifBtns.forEach(function (v) {
      var btn = document.createElement('button');
      btn.id = 'debug-verif-' + v.key;
      btn.textContent = v.label;
      Object.assign(btn.style, {
        flex: '1', padding: '8px 10px', borderRadius: '10px',
        border: '1px solid rgba(241,231,210,0.12)', background: 'rgba(255,255,255,0.04)',
        color: '#f1e7d2', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
        textAlign: 'center', transition: 'all 180ms', fontFamily: "'Inter', sans-serif"
      });
      btn.addEventListener('mouseenter', function () {
        if (activeVerification !== v.key) {
          btn.style.background = 'rgba(255,255,255,0.08)';
          btn.style.borderColor = v.color;
        }
      });
      btn.addEventListener('mouseleave', function () {
        if (activeVerification !== v.key) {
          btn.style.background = 'rgba(255,255,255,0.04)';
          btn.style.borderColor = 'rgba(241,231,210,0.12)';
        }
      });
      btn.addEventListener('click', function () {
        if (!activeRole || activeRole === 'admin') {
          alert('Please select a Student or Business role first.');
          return;
        }
        activateRole(activeRole, v.key);
      });
      verifRow.appendChild(btn);
    });
    panel.appendChild(verifRow);

    // Divider
    panel.appendChild(makeDivider());

    // Page navigation label
    var navLabel = document.createElement('div');
    navLabel.style.cssText = 'font-size:10px; text-transform:uppercase; letter-spacing:1px; color:rgba(241,231,210,0.45); font-weight:600;';
    navLabel.textContent = 'Navigate';
    panel.appendChild(navLabel);

    // Page links
    PAGES.forEach(function (p) {
      var a = document.createElement('a');
      a.href = p.href;
      a.textContent = p.label;
      Object.assign(a.style, {
        display: 'block', padding: '7px 14px', borderRadius: '8px',
        color: '#f1e7d2', fontSize: '12px', textDecoration: 'none',
        transition: 'background 180ms', fontFamily: "'Inter', sans-serif"
      });
      var isCurrent = window.location.pathname.includes(p.href) ||
        (p.href === 'index.html' && !window.location.pathname.includes('students') &&
          !window.location.pathname.includes('business') && !window.location.pathname.includes('admin'));
      if (isCurrent) {
        a.style.background = 'rgba(255,209,92,0.1)';
        a.style.color = '#ffd15c';
        a.style.fontWeight = '600';
      }
      a.addEventListener('mouseenter', function () {
        if (!isCurrent) a.style.background = 'rgba(255,255,255,0.06)';
      });
      a.addEventListener('mouseleave', function () {
        if (!isCurrent) a.style.background = 'none';
      });
      panel.appendChild(a);
    });

    // Divider
    panel.appendChild(makeDivider());

    // Reset button
    var resetBtn = document.createElement('button');
    resetBtn.textContent = '↺ Reset & Reload';
    Object.assign(resetBtn.style, {
      width: '100%', padding: '8px 14px', borderRadius: '10px',
      border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)',
      color: '#ff6b6b', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
      transition: 'all 180ms', fontFamily: "'Inter', sans-serif"
    });
    resetBtn.addEventListener('mouseenter', function () {
      resetBtn.style.background = 'rgba(255,107,107,0.15)';
    });
    resetBtn.addEventListener('mouseleave', function () {
      resetBtn.style.background = 'rgba(255,107,107,0.08)';
    });
    resetBtn.addEventListener('click', resetDebug);
    panel.appendChild(resetBtn);

    // Active role indicator
    var indicator = document.createElement('div');
    indicator.id = 'debug-role-indicator';
    indicator.style.cssText = 'font-size:10px; color:rgba(241,231,210,0.35); text-align:center; margin-top:2px;';
    indicator.textContent = 'No role active';
    panel.appendChild(indicator);

    document.body.appendChild(toggle);
    document.body.appendChild(panel);
  }

  function makeDivider() {
    var d = document.createElement('div');
    d.style.cssText = 'height:1px; background:rgba(241,231,210,0.08); margin:2px 0;';
    return d;
  }

  function updatePanelButtons() {
    var colors = { student: '#ffd15c', business: '#7c6bf0', admin: '#ff6b6b' };
    ['student', 'business', 'admin'].forEach(function (role) {
      var btn = document.getElementById('debug-role-' + role);
      if (!btn) return;
      if (role === activeRole) {
        btn.style.background = colors[role] + '22';
        btn.style.borderColor = colors[role];
        btn.style.color = colors[role];
        btn.style.fontWeight = '700';
      } else {
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(241,231,210,0.12)';
        btn.style.color = '#f1e7d2';
        btn.style.fontWeight = '500';
      }
    });

    // Update verification buttons
    var verifColors = { Pending: '#f0a030', Verified: '#34d399' };
    ['Pending', 'Verified'].forEach(function (v) {
      var btn = document.getElementById('debug-verif-' + v);
      if (!btn) return;
      if (v === activeVerification) {
        btn.style.background = verifColors[v] + '22';
        btn.style.borderColor = verifColors[v];
        btn.style.color = verifColors[v];
        btn.style.fontWeight = '700';
      } else {
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(241,231,210,0.12)';
        btn.style.color = '#f1e7d2';
        btn.style.fontWeight = '500';
      }
    });

    var indicator = document.getElementById('debug-role-indicator');
    if (indicator) {
      var text = 'No role active';
      if (activeRole) {
        text = 'Active: ' + activeRole.charAt(0).toUpperCase() + activeRole.slice(1);
        if (activeVerification) {
          text += ' (' + activeVerification + ')';
        }
      }
      indicator.textContent = text;
    }
  }

  // ── Restore debug state after reload ─────────────────────────────────
  function restoreDebugState() {
    var stateStr = sessionStorage.getItem('s3_debug_state');
    if (!stateStr) return;

    try {
      var state = JSON.parse(stateStr);
      sessionStorage.removeItem('s3_debug_state');

      // Re-set the session so the page recognizes the debug user
      var user = Object.assign({}, ROLES[state.role]);
      activeRole = state.role;
      activeVerification = state.verification || null;

      window.setSession(user);
      localStorage.setItem('s3_session_role', state.role);
      window.updateAuthUI();
      unlockPage(state.role);
      updatePanelButtons();
    } catch (e) {
      console.error('[Debug] Failed to restore state:', e);
    }
  }

  // ── Bootstrap ────────────────────────────────────────────────────────
  function init() {
    createPanel();
    restoreDebugState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { waitForUtils(init); });
  } else {
    waitForUtils(init);
  }
})();
