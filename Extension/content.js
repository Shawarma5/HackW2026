// ============================================================
// PYODIDE (in-browser Python execution)
// ============================================================
// Loaded lazily on first "Run Code" click, then cached for the
// rest of the page's life.
//
// IMPORTANT: Manifest V3 blocks extensions from loading remotely
// hosted script, even via dynamic import() -- this is enforced by
// Chrome itself, not just a manifest setting you can loosen. So
// Pyodide's files must be bundled inside the extension (in a
// pyodide/ folder, declared under web_accessible_resources) and
// loaded from chrome-extension://<id>/pyodide/, which is already
// an allowed script-src origin.
const PYODIDE_INDEX_URL = chrome.runtime.getURL("pyodide/");

let pyodideReadyPromise = null;

function getPyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      const { loadPyodide } = await import(
        /* webpackIgnore: true */ `${PYODIDE_INDEX_URL}pyodide.mjs`
      );
      return loadPyodide({ indexURL: PYODIDE_INDEX_URL });
    })();
  }
  return pyodideReadyPromise;
}

// Runs `code` in Pyodide and captures stdout/stderr instead of
// letting them go to the devtools console.
async function runPythonCode(code) {
  const pyodide = await getPyodide();

  let stdout = "";
  let stderr = "";

  pyodide.setStdout({ batched: (msg) => { stdout += msg + "\n"; } });
  pyodide.setStderr({ batched: (msg) => { stderr += msg + "\n"; } });

  // Fresh globals dict per run so leftover defs/variables from a
  // previous "Run Code" click don't leak into this one (the
  // pyodide instance itself is still reused/cached -- only the
  // namespace code executes in is reset).
  const namespace = pyodide.globals.get("dict")();

  try {
    await pyodide.loadPackagesFromImports(code);
    await pyodide.runPythonAsync(code, { globals: namespace });
    return { stdout, stderr, error: null };
  } catch (err) {
    return { stdout, stderr, error: err.message || String(err) };
  } finally {
    namespace.destroy();
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

// Injected once so the popup's loading state can show a spinner
// + a moving "..." instead of static text that looks frozen.
function ensureCsStyles() {
  if (document.getElementById('cs-term-styles')) return;

  let style = document.createElement('style');
  style.id = 'cs-term-styles';
  style.textContent = `
    @keyframes cs-spin { to { transform: rotate(360deg); } }
    @keyframes cs-ellipsis {
      0%   { content: ''; }
      25%  { content: '.'; }
      50%  { content: '..'; }
      75%  { content: '...'; }
      100% { content: ''; }
    }
    @keyframes cs-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .cs-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-right: 8px;
      vertical-align: middle;
      border: 2px solid rgba(255,255,255,0.25);
      border-top-color: #4CAF50;
      border-radius: 50%;
      animation: cs-spin 0.7s linear infinite;
    }
    .cs-loading-text {
      vertical-align: middle;
    }
    .cs-loading-text::after {
      content: '';
      display: inline-block;
      width: 1.2em;
      text-align: left;
      animation: cs-ellipsis 1.2s steps(4, end) infinite;
    }
    #cs-term-popup, #cs-term-sidebar {
      animation: cs-fade-in 0.15s ease-out;
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('mouseup', (event) => {
  let existingPopup = document.getElementById('cs-term-popup');
  let existingSidebar = document.getElementById('cs-term-sidebar');

  if (existingPopup && existingPopup.contains(event.target)) return;
  if (existingSidebar && existingSidebar.contains(event.target)) return;

  let selectedText = window.getSelection().toString().trim();

  if (existingPopup) {
    existingPopup.remove();
  }

  if (selectedText.length > 0) {
    ensureCsStyles();

    let popup = document.createElement('div');
    popup.id = 'cs-term-popup';
    popup.innerHTML = `
      <button class="cs-popup-close" style="position:absolute; top:6px; right:8px; background:none; border:none; color:#aaa; font-size:16px; line-height:1; cursor:pointer; padding:0;">&times;</button>
      <strong>Term:</strong> ${escapeHTML(selectedText)} <br><br>
      Explain this term?
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button id="cs-confirm-yes" style="flex:1; padding:6px 12px; background:#4CAF50; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Yes, explain</button>
        <button id="cs-confirm-no" style="padding:6px 12px; background:#333; color:#ccc; border:none; border-radius:4px; cursor:pointer;">Not now</button>
      </div>
    `;

    popup.style.position = 'absolute';
    popup.style.backgroundColor = '#202122';
    popup.style.color = '#f8f9fa';
    popup.style.padding = '12px 24px 12px 12px';
    popup.style.borderRadius = '6px';
    popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    popup.style.zIndex = '2147483647';
    popup.style.fontFamily = 'sans-serif';
    popup.style.fontSize = '14px';
    popup.style.maxWidth = '300px';

    document.body.appendChild(popup);

    // Position after appending (so we can measure it), and clamp
    // to the viewport so it never renders off the right/bottom edge.
    let popupRect = popup.getBoundingClientRect();
    let left = event.pageX + 10;
    let top = event.pageY + 15;
    let maxLeft = window.scrollX + document.documentElement.clientWidth - popupRect.width - 10;
    let maxTop = window.scrollY + document.documentElement.clientHeight - popupRect.height - 10;
    popup.style.left = `${Math.max(10, Math.min(left, maxLeft))}px`;
    popup.style.top = `${Math.max(10, Math.min(top, maxTop))}px`;

    popup.querySelector('.cs-popup-close').onmousedown = (e) => {
      e.stopPropagation();
      popup.remove();
    };

    popup.querySelector('#cs-confirm-no').onmousedown = (e) => {
      e.stopPropagation();
      popup.remove();
    };

    // Confirming doesn't fetch anything itself -- it just hands off to
    // the sidebar, which opens right away in a loading state and fetches
    // the definition itself (see openSidebarForTerm below).
    popup.querySelector('#cs-confirm-yes').onmousedown = (e) => {
      e.stopPropagation();
      popup.remove();
      openSidebarForTerm(selectedText);
    };
  }
});

document.addEventListener('mousedown', (event) => {
  let popup = document.getElementById('cs-term-popup');
  if (popup && event.target !== popup && !popup.contains(event.target)) {
    popup.remove();
  }
});

// Tracks whatever narration audio is currently playing so a newly opened
// sidebar (or a page-wide selection) can stop the previous one first.
let activeNarrationAudio = null;

// Monotonically increasing token so a stale /define response (from a
// sidebar the user already closed, or replaced by highlighting a new
// term before the first one finished loading) never overwrites whatever
// is currently on screen.
let sidebarRequestToken = 0;

// Builds the empty sidebar frame (panel + resizer + scrollable content
// area) and attaches it to the page. Callers fill in contentContainer's
// innerHTML afterward -- this only handles the chrome around it.
function createSidebarShell() {
  let sidebar = document.createElement('div');
  sidebar.id = 'cs-term-sidebar';
  sidebar.style.position = 'fixed';
  sidebar.style.top = '0';
  sidebar.style.right = '0';
  sidebar.style.width = '450px'; // Made slightly wider to accommodate more text comfortably
  sidebar.style.height = '100vh';
  sidebar.style.backgroundColor = '#181a1b';
  sidebar.style.color = '#e8e6e3';
  sidebar.style.boxShadow = '-4px 0 15px rgba(0,0,0,0.5)';
  sidebar.style.zIndex = '2147483647';
  sidebar.style.boxSizing = 'border-box';
  sidebar.style.fontFamily = 'sans-serif';

  let contentContainer = document.createElement('div');
  contentContainer.style.padding = '24px';
  contentContainer.style.paddingBottom = '80px';
  contentContainer.style.height = '100%';
  contentContainer.style.boxSizing = 'border-box';
  contentContainer.style.overflowY = 'auto';

  let resizer = document.createElement('div');
  resizer.style.width = '6px';
  resizer.style.cursor = 'ew-resize';
  resizer.style.position = 'absolute';
  resizer.style.left = '0';
  resizer.style.top = '0';
  resizer.style.bottom = '0';
  resizer.style.backgroundColor = 'transparent';
  resizer.style.zIndex = '10';

  resizer.addEventListener('mouseenter', () => resizer.style.backgroundColor = '#007acc');
  resizer.addEventListener('mouseleave', () => resizer.style.backgroundColor = 'transparent');

  let isResizing = false;
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < 800) {
      sidebar.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
    }
  });

  sidebar.appendChild(resizer);
  sidebar.appendChild(contentContainer);
  document.body.appendChild(sidebar);

  return { sidebar, contentContainer };
}

// Renders the close button + heading + a centered spinner/ellipsis into
// an already-open sidebar's content area. Shared by the initial loading
// state and by the error state (which keeps the same header).
function renderSidebarHeader(contentContainer, term, bodyHTML) {
  contentContainer.innerHTML = `
    <button id="close-sidebar" style="float:right; background:none; border:none; color:#e8e6e3; font-size:20px; cursor:pointer;">&times;</button>
    <h2 style="margin-top:0; margin-bottom:24px; color:#4CAF50;">${escapeHTML(term)}</h2>
    ${bodyHTML}
  `;
}

// Opens the sidebar immediately in a loading state for `term`, then
// fetches its definition in the background and fills the sidebar in
// once the response arrives (or shows an error in place if it fails).
function openSidebarForTerm(term) {
  let existingSidebar = document.getElementById('cs-term-sidebar');
  if (existingSidebar) existingSidebar.remove();

  if (activeNarrationAudio) {
    activeNarrationAudio.pause();
    activeNarrationAudio = null;
  }

  ensureCsStyles();

  let thisRequest = ++sidebarRequestToken;
  let { sidebar, contentContainer } = createSidebarShell();

  renderSidebarHeader(contentContainer, term, `
    <div style="display:flex; align-items:center; justify-content:center; padding:60px 0; color:#ccc;">
      <span class="cs-spinner" style="width:18px; height:18px; margin-right:10px;"></span>
      <em class="cs-loading-text" style="font-size:15px;">Fetching definition</em>
    </div>
  `);
  document.getElementById('close-sidebar').onclick = () => sidebar.remove();

  fetch(`http://localhost:8000/define?term=${encodeURIComponent(term)}`)
    .then(response => response.json())
    .then(data => {
      // Bail out if the user closed this sidebar, or opened a newer one
      // for a different term, while this request was still in flight.
      if (thisRequest !== sidebarRequestToken || !document.body.contains(sidebar)) return;

      if (data.error) {
        renderSidebarHeader(contentContainer, term, `
          <p style="color:#ff8888;">Backend Error: ${escapeHTML(data.error)}</p>
        `);
        document.getElementById('close-sidebar').onclick = () => sidebar.remove();
        return;
      }

      renderSidebarContent(sidebar, contentContainer, data);
    })
    .catch(() => {
      if (thisRequest !== sidebarRequestToken || !document.body.contains(sidebar)) return;

      renderSidebarHeader(contentContainer, term, `
        <p style="color:#ff8888;">Could not connect to local server.</p>
      `);
      document.getElementById('close-sidebar').onclick = () => sidebar.remove();
    });
}

// Fills an already-open sidebar with the full definition/analogy/use
// case/code/quiz content once /define has returned, and wires up all of
// its interactive bits (narration, quiz grading, code execution).
function renderSidebarContent(sidebar, contentContainer, data) {
  contentContainer.innerHTML = `
    <button id="close-sidebar" style="float:right; background:none; border:none; color:#e8e6e3; font-size:20px; cursor:pointer;">&times;</button>
    <h2 style="margin-top:0; margin-bottom:4px; color:#4CAF50;">${escapeHTML(data.term)}</h2>

    <button id="narrate-btn" style="display:flex; align-items:center; gap:6px; margin-bottom:16px; padding:6px 14px; background:#2a2b2c; color:#e8e6e3; border:1px solid #444; border-radius:20px; cursor:pointer; font-size:13px;">
      <span id="narrate-icon">🔊</span><span id="narrate-label">Narrate</span>
    </button>

    <h3 style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 4px;">Definition</h3>
    <p style="color:#aaa; line-height: 1.5; margin-top: 8px;">${escapeHTML(data.detailed_definition)}</p>
    
    <h3 style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 4px;">Analogy</h3>
    <p style="color:#aaa; line-height: 1.5; margin-top: 8px;">${escapeHTML(data.analogy)}</p>
    
    <h3 style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 4px;">Use Case</h3>
    <p style="color:#aaa; line-height: 1.5; margin-top: 8px;">${escapeHTML(data.use_case)}</p>
    
    <h3 style="margin-top: 24px; border-bottom: 1px solid #333; padding-bottom: 4px;">Python Implementation</h3>
    <textarea id="code-editor" spellcheck="false" style="width:100%; min-height:120px; background:#000; color:#e8e6e3; padding:12px; border-radius:6px; border:1px solid #333; font-family:monospace; font-size:13px; line-height:1.4; box-sizing:border-box; resize:vertical; white-space:pre;">${escapeHTML(data.python_code_example)}</textarea>

    <div style="display:flex; gap:8px; margin-top:8px;">
      <button id="run-code-btn" style="flex:1; padding:8px 16px; background:#ff9800; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Run Code</button>
      <button id="reset-code-btn" title="Restore original code" style="padding:8px 12px; background:#333; color:#ccc; border:none; border-radius:4px; cursor:pointer;">Reset</button>
    </div>
    <div id="code-output" style="margin-top:12px; padding:10px; background:#000; border:1px solid #444; border-radius:4px; display:none; white-space:pre-wrap; font-family:monospace; font-size:13px;"></div>
    ${data.experiment_prompt ? `
    <div style="margin-top:12px; padding:10px 12px; background:#1a2a1e; border-left:3px solid #4CAF50; border-radius:4px; color:#c8e6c9; font-size:13px; line-height:1.4;">
      💡 <em>${escapeHTML(data.experiment_prompt)}</em>
    </div>` : ''}
    
    <hr style="border-color:#333; margin: 30px 0;">
    
    <!-- Opt-in Button -->
    <div id="quiz-toggle-container" style="text-align: center;">
        <button id="show-quiz-btn" style="padding:10px 20px; background:#007acc; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; width: 100%;">Test Your Knowledge</button>
    </div>

    <!-- Hidden Quiz Section -->
    <div id="quiz-section" style="display:none;">
        <h3 style="color: #007acc;">Knowledge Check</h3>
        <p style="line-height: 1.4;">${escapeHTML(data.quiz_question)}</p>
        <textarea id="quiz-answer" placeholder="Type your answer here..." rows="1" style="width:100%; padding:8px; margin-bottom:10px; background:#222; color:#fff; border:1px solid #444; border-radius:4px; resize:none; overflow:hidden; font-family:sans-serif; box-sizing:border-box;"></textarea>
        <button id="submit-quiz" style="padding:8px 16px; background:#4CAF50; color:#fff; border:none; border-radius:4px; cursor:pointer;">Submit</button>
        <div id="quiz-feedback" style="margin-top:12px; padding: 10px; border-radius: 4px; display: none; line-height: 1.4;"></div>
    </div>
  `;

  // Unhide Quiz Logic
  document.getElementById('show-quiz-btn').onclick = () => {
    document.getElementById('quiz-toggle-container').style.display = 'none';
    document.getElementById('quiz-section').style.display = 'block';
  };

  // Auto-expand logic for quiz textarea
  let quizInput = document.getElementById('quiz-answer');
  quizInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });

  // Quiz submission logic
  document.getElementById('submit-quiz').onclick = async () => {
    let answerText = quizInput.value.trim();
    let feedbackDiv = document.getElementById('quiz-feedback');
    let submitBtn = document.getElementById('submit-quiz');

    if (!answerText) return;

    submitBtn.innerText = "Grading...";
    submitBtn.disabled = true;
    feedbackDiv.style.display = 'block';
    feedbackDiv.style.backgroundColor = '#333';
    feedbackDiv.style.color = '#ddd';
    feedbackDiv.innerText = "Evaluating your answer...";

    try {
      let response = await fetch('http://localhost:8000/check_answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: data.term,
          question: data.quiz_question,
          answer: answerText
        })
      });

      let result = await response.json();

      if (result.error) {
        feedbackDiv.style.backgroundColor = '#442222';
        feedbackDiv.style.color = '#ff8888';
        feedbackDiv.innerText = "Error: " + result.error;
      } else {
        if (result.is_correct) {
          feedbackDiv.style.backgroundColor = '#1e3a23';
          feedbackDiv.style.color = '#4CAF50';
        } else {
          feedbackDiv.style.backgroundColor = '#4a2b18';
          feedbackDiv.style.color = '#ff9800';
        }
        feedbackDiv.innerText = result.feedback;
      }
    } catch (err) {
      feedbackDiv.style.backgroundColor = '#442222';
      feedbackDiv.style.color = '#ff8888';
      feedbackDiv.innerText = "Error: Could not reach backend to evaluate answer.";
    } finally {
      submitBtn.innerText = "Submit";
      submitBtn.disabled = false;
    }
  };

  // Code Execution Logic
  let runBtn = document.getElementById('run-code-btn');
  let resetBtn = document.getElementById('reset-code-btn');
  let outputDiv = document.getElementById('code-output');
  let codeEditor = document.getElementById('code-editor');

  if (resetBtn && codeEditor) {
    resetBtn.onclick = () => {
      codeEditor.value = data.python_code_example;
    };
  }

  if (runBtn) {
    runBtn.onclick = async () => {
      runBtn.disabled = true;
      outputDiv.style.display = 'block';
      outputDiv.style.color = '#aaa';

      // First run on a page downloads the Pyodide runtime (a few
      // MB), so it's noticeably slower than subsequent runs.
      let isFirstLoad = !pyodideReadyPromise;
      runBtn.innerText = isFirstLoad ? "Loading Python..." : "Running...";
      outputDiv.innerText = isFirstLoad
        ? "Loading Python runtime (first run only, ~5-10s)..."
        : "Executing...";

      try {
        let result = await runPythonCode(codeEditor.value);

        if (result.error) {
          outputDiv.style.color = '#ff8888';
          outputDiv.innerText = result.stderr
            ? `${result.stderr}\n${result.error}`
            : result.error;
        } else if (result.stderr) {
          outputDiv.style.color = '#ff8888';
          outputDiv.innerText = result.stderr;
        } else {
          outputDiv.style.color = '#4CAF50';
          outputDiv.innerText = result.stdout || "Code executed successfully (no output).";
        }
      } catch (err) {
        outputDiv.style.color = '#ff8888';
        outputDiv.innerText = "Error: Could not load or run the Python runtime.";
      } finally {
        runBtn.innerText = "Run Code";
        runBtn.disabled = false;
      }
    };
  }
  
  // Narration Logic (ElevenLabs text-to-speech of the definition + analogy)
  let narrateBtn = document.getElementById('narrate-btn');
  let narrateIcon = document.getElementById('narrate-icon');
  let narrateLabel = document.getElementById('narrate-label');
  let narrateAudio = null;
  let narrateObjectUrl = null;

  function stopNarration() {
    if (narrateAudio) {
      narrateAudio.pause();
    }
    if (narrateObjectUrl) {
      URL.revokeObjectURL(narrateObjectUrl);
      narrateObjectUrl = null;
    }
  }

  if (narrateBtn) {
    narrateBtn.onclick = async () => {
      // Already fetched -- just toggle play/pause instead of re-fetching.
      if (narrateAudio) {
        if (narrateAudio.paused) {
          narrateAudio.play();
          narrateIcon.innerText = '⏸';
          narrateLabel.innerText = 'Pause';
        } else {
          narrateAudio.pause();
          narrateIcon.innerText = '🔊';
          narrateLabel.innerText = 'Narrate';
        }
        return;
      }

      narrateBtn.disabled = true;
      narrateIcon.innerText = '⏳';
      narrateLabel.textContent = 'Loading';
      narrateLabel.classList.add('cs-loading-text');

      try {
        let narrationText = [data.detailed_definition, data.analogy]
          .filter(Boolean)
          .join('. ');

        let response = await fetch('http://localhost:8000/narrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: narrationText })
        });

        let contentType = response.headers.get('content-type') || '';

        if (!response.ok || contentType.includes('application/json')) {
          let errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned ${response.status}`);
        }

        let audioBlob = await response.blob();
        narrateObjectUrl = URL.createObjectURL(audioBlob);
        narrateAudio = new Audio(narrateObjectUrl);

        narrateAudio.onended = () => {
          narrateIcon.innerText = '🔊';
          narrateLabel.innerText = 'Narrate';
        };

        narrateLabel.classList.remove('cs-loading-text');
        activeNarrationAudio = narrateAudio;
        await narrateAudio.play();
        narrateIcon.innerText = '⏸';
        narrateLabel.innerText = 'Pause';
      } catch (err) {
        narrateLabel.classList.remove('cs-loading-text');
        narrateIcon.innerText = '🔊';
        narrateLabel.innerText = 'Narrate';
        alert('Narration error: ' + err.message);
      } finally {
        narrateBtn.disabled = false;
      }
    };
  }

  document.getElementById('close-sidebar').onclick = () => {
    stopNarration();
    sidebar.remove();
  };
}