const $ = (id) => document.getElementById(id);

let successes = 0, failures = 0, busy = false, testNumber = 0;
let toastTimer;
let audioContext;

// IMPORTANT: paste your Lambda Function URL here after deployment.
const LAMBDA_FUNCTION_URL = "https://mgdegiq5cavzitk5mnncnnlkyu0ybagd.lambda-url.us-east-1.on.aws/";

function prepareBuzzerAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') audioContext.resume();
}

function playBuzzer() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  [880, 1175].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + index * 0.16;
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.13);
  });
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function timeNow() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function addLog(title, detail, failed = false) {
  const list = $('logList');
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-mark ${failed ? 'error' : ''}"></span>
    <div class="log-copy"><b></b><small></small></div>
    <span class="log-result ${failed ? 'error' : ''}">${failed ? 'FAILED' : 'SUCCESS'}</span>`;
  entry.querySelector('.log-copy b').textContent = title;
  entry.querySelector('.log-copy small').textContent = `${timeNow()} · ${detail}`;
  list.prepend(entry);
}

function setIndicator(result) {
  $('led').className = `led ${result}`;
  $('ledText').textContent =
    result === 'on'
      ? 'ON · Replication confirmed'
      : 'OFF · Replication not confirmed';

  $('buzzer').className = `buzzer ${result === 'on' ? 'active' : ''}`;
  $('buzzerText').textContent =
    result === 'on'
      ? '♪ Confirmation signal played'
      : 'Silent · No success confirmation';
}

function resetIndicators() {
  $('led').className = 'led';
  $('ledText').textContent = 'OFF · Test in progress';
  $('buzzer').className = 'buzzer';
  $('buzzerText').textContent = 'Silent · Waiting for result';
}

function updateProgress(value, label) {
  $('progressBar').style.width = `${value}%`;
  $('progressText').textContent = `${value}%`;
  $('flowLabel').textContent = label;
}

function setRunningState() {
  busy = true;
  $('runTestBtn').disabled = true;
  $('deviceButton').disabled = true;
  $('overallStatus').textContent = 'Testing…';
  $('statusDetail').textContent = `Test #${testNumber} is running`;
  $('pipelineTag').textContent = 'IN PROGRESS';
  $('pipelineTag').className = 'tag neutral';
  $('flowDot').className = 'moving';
  resetIndicators();
  updateProgress(10, 'Sending test request to Lambda');
}

function setSuccessState(result, elapsed) {
  successes++;
  $('successCount').textContent = successes;
  $('overallStatus').textContent = 'Success';
  $('statusDetail').textContent =
    result.message || 'Test object confirmed in destination';
  $('duration').textContent = `${elapsed}s`;
  $('pipelineTag').textContent = 'SUCCESS';
  $('pipelineTag').className = 'tag success';
  $('flowDot').className = '';
  updateProgress(100, 'Replication confirmed');
  setIndicator('on');
  playBuzzer();
}

function setFailureState(message, elapsed) {
  failures++;
  $('failedCount').textContent = failures;
  $('overallStatus').textContent = 'Failed';
  $('statusDetail').textContent = message || 'Replication was not confirmed';
  $('duration').textContent = `${elapsed}s`;
  $('pipelineTag').textContent = 'FAILED';
  $('pipelineTag').className = 'tag neutral';
  $('flowDot').className = '';
  updateProgress(100, 'Replication not confirmed');
  setIndicator('off');
}

async function runTest() {
  if (busy) return;

  if (!LAMBDA_FUNCTION_URL ||
      LAMBDA_FUNCTION_URL === "PASTE_YOUR_LAMBDA_FUNCTION_URL_HERE") {
    showToast('Add your Lambda Function URL in script.js first');
    return;
  }

  prepareBuzzerAudio();
  busy = true;
  testNumber++;
  const start = Date.now();

  setRunningState();
  addLog(`Test #${testNumber} initiated`, 'Browser sent replication test to AWS Lambda');
  showToast('Replication test sent to AWS Lambda');

  try {
    updateProgress(30, 'Lambda test event processed');

    const response = await fetch(LAMBDA_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replication_test',
        test_number: testNumber,
        requested_at: new Date().toISOString()
      })
    });

    updateProgress(70, 'Checking destination object');

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Lambda returned a failed result');
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    setSuccessState(data, elapsed);

    addLog('Replication confirmed',
      `S3 source object verified in destination · ${data.test_key || 'test object'}`);
    showToast('AWS replication confirmed · LED ON · Buzzer signal');
  } catch (error) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    setFailureState(error.message, elapsed);
    addLog('Replication confirmation failed', error.message, true);
    showToast(`Replication test failed: ${error.message}`);
  } finally {
    busy = false;
    $('runTestBtn').disabled = false;
    $('deviceButton').disabled = false;
  }
}

$('runTestBtn').addEventListener('click', runTest);
$('deviceButton').addEventListener('click', runTest);

$('clearLogs').addEventListener('click', () => {
  $('logList').innerHTML =
    '<div class="empty-state"><span>≡</span><b>No activity yet</b>' +
    '<small>Run a replication test to see events here.</small></div>';
  showToast('Activity logs cleared');
});

$('currentDate').textContent =
  new Date().toLocaleDateString([], {
    day: '2-digit', month: 'short', year: 'numeric'
  });

addLog('Dashboard initialized', 'Ready to connect to AWS Lambda');
