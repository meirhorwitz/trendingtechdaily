console.log('config.js loaded');

// Firebase configuration for TrendingTech Daily
const firebaseConfig = {
  apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg",
  authDomain: "trendingtech-daily.firebaseapp.com",
  projectId: "trendingtech-daily",
  storageBucket: "trendingtech-daily.firebasestorage.app",
  messagingSenderId: "343812872871",
  appId: "1:343812872871:web:5bd68bd7d6140d83551982"
};

// Initialize Firebase once
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('Firebase initialized by config.js');
}
