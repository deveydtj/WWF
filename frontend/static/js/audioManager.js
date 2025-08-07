/**
 * Audio management for WordSquad game.
 * Handles sound effects, audio context, and audio preferences.
 */

// Audio context and settings
let audioContext = null;
let soundEnabled = false;

// Initialize sound setting from localStorage (browser only)
if (typeof localStorage !== 'undefined') {
  soundEnabled = localStorage.getItem('soundEnabled') === 'true';
}

// Audio nodes
let clickOscillator = null;
let clickGain = null;
let jingleOscillator = null;
let jingleGain = null;

function ensureAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create persistent audio nodes for better performance
      clickGain = audioContext.createGain();
      clickGain.connect(audioContext.destination);
      clickGain.gain.value = 0.1;
      
      jingleGain = audioContext.createGain();
      jingleGain.connect(audioContext.destination);
      jingleGain.gain.value = 0.2;
    } catch (e) {
      console.warn('Audio context creation failed:', e);
      audioContext = null;
    }
  }
}

function stopAllSounds() {
  if (clickOscillator) {
    try {
      clickOscillator.stop();
      clickOscillator.disconnect();
    } catch (e) {
      // Ignore errors when stopping already-stopped oscillators
    }
    clickOscillator = null;
  }
  
  if (jingleOscillator) {
    try {
      jingleOscillator.stop();
      jingleOscillator.disconnect();
    } catch (e) {
      // Ignore errors when stopping already-stopped oscillators
    }
    jingleOscillator = null;
  }
}

function playClick() {
  if (!soundEnabled || !audioContext) return;
  
  try {
    // Stop any existing click sound
    if (clickOscillator) {
      clickOscillator.stop();
      clickOscillator.disconnect();
    }
    
    clickOscillator = audioContext.createOscillator();
    clickOscillator.connect(clickGain);
    clickOscillator.frequency.value = 800;
    clickOscillator.type = 'sine';
    clickOscillator.start();
    clickOscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    console.warn('Click sound failed:', e);
  }
}

function playJingle() {
  if (!soundEnabled || !audioContext) return;
  
  try {
    // Stop any existing jingle
    if (jingleOscillator) {
      jingleOscillator.stop();
      jingleOscillator.disconnect();
    }
    
    jingleOscillator = audioContext.createOscillator();
    jingleOscillator.connect(jingleGain);
    
    // Play a simple ascending melody
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    let time = audioContext.currentTime;
    
    notes.forEach((freq, i) => {
      jingleOscillator.frequency.setValueAtTime(freq, time + i * 0.15);
    });
    
    jingleOscillator.type = 'sine';
    jingleOscillator.start();
    jingleOscillator.stop(time + 0.6);
  } catch (e) {
    console.warn('Jingle sound failed:', e);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  
  // Save to localStorage (browser only)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('soundEnabled', soundEnabled);
  }
  
  // Update UI
  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggle.setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
  }
  
  // Ensure audio context is ready when enabling sound
  if (soundEnabled) {
    ensureAudioContext();
  } else {
    stopAllSounds();
  }
}

function isSoundEnabled() {
  return soundEnabled;
}

// Initialize audio system
function initAudio() {
  // Set initial sound toggle state
  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggle.setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
  }
  
  // Initialize audio context on first user interaction
  document.addEventListener('click', ensureAudioContext, { once: true });
  document.addEventListener('keydown', ensureAudioContext, { once: true });
}

export {
  ensureAudioContext,
  stopAllSounds,
  playClick,
  playJingle,
  toggleSound,
  isSoundEnabled,
  initAudio
};