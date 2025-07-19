// Authentication functionality for TrendingTech Daily

// Initialize auth state listener
function initializeAuth() {
    if (!firebase.apps.length) {
        console.error('Firebase has not been initialized. Auth functions may not work.');
        return;
    }

    const auth = firebase.auth();

    const loginLink = document.getElementById('auth-login-link');
    const signupLink = document.getElementById('auth-signup-link');
    const profileMenu = document.getElementById('auth-profile-menu');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const userDisplayNameNav = document.getElementById('user-display-name-nav');
    const userProfilePicNav = document.getElementById('user-profile-pic-nav');
    const userNameNav = document.getElementById('user-name-nav');
    const userIconNav = document.getElementById('user-icon-nav');

    // Listen for authentication state changes
    auth.onAuthStateChanged(function(user) {
        if (user) {
            // User is signed in.
            if (loginLink) loginLink.style.display = 'none';
            if (signupLink) signupLink.style.display = 'none';
            if (profileMenu) profileMenu.style.display = 'block';

            const displayName = user.displayName || user.email || 'User';
            if (userDisplayNameNav) {
                userDisplayNameNav.textContent = displayName;
            }
            if (userNameNav) {
                userNameNav.textContent = displayName;
                userNameNav.classList.remove('d-none');
            }
            if (userProfilePicNav) {
                userProfilePicNav.src = user.photoURL || '/img/default-avatar.png';
                userProfilePicNav.style.display = 'block';
            }
            if (userIconNav) userIconNav.style.display = 'none';

            console.log('User is signed in:', user.uid);
        } else {
            // User is signed out.
            if (loginLink) loginLink.style.display = 'block';
            if (signupLink) signupLink.style.display = 'block';
            if (profileMenu) profileMenu.style.display = 'none';

            if (userNameNav) {
                userNameNav.textContent = 'Login';
                userNameNav.classList.remove('d-none');
            }
            if (userProfilePicNav) {
                userProfilePicNav.style.display = 'none';
            }
            if (userIconNav) userIconNav.style.display = 'inline-block';

            console.log('User is signed out.');
        }
    });

    // Handle logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            auth.signOut().then(function() {
                // Sign-out successful.
                console.log('User signed out successfully.');
                // Redirect or update UI as needed
                window.location.href = '/'; 
            }).catch(function(error) {
                // An error happened.
                console.error('Error signing out:', error);
                alert('Error signing out: ' + error.message);
            });
        });
    }
}

// Export for use in other scripts
window.initializeAuth = initializeAuth;

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
} 