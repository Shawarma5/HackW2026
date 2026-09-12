function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
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
    let popup = document.createElement('div');
    popup.id = 'cs-term-popup';
    popup.innerHTML = `<strong>Term:</strong> ${selectedText} <br><br> <em>Fetching definition...</em>`;

    popup.style.position = 'absolute';
    popup.style.left = `${event.pageX + 10}px`;
    popup.style.top = `${event.pageY + 15}px`;
    popup.style.backgroundColor = '#202122';
    popup.style.color = '#f8f9fa';
    popup.style.padding = '12px';
    popup.style.borderRadius = '6px';
    popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    popup.style.zIndex = '2147483647';
    popup.style.fontFamily = 'sans-serif';
    popup.style.fontSize = '14px';
    popup.style.maxWidth = '300px';

    document.body.appendChild(popup);

    fetch(`http://localhost:8000/define?term=${encodeURIComponent(selectedText)}`)
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          popup.innerHTML = `<strong>Backend Error:</strong> ${data.error}`;
          return;
        }

        // Updated Tooltip: Only shows the short definition
        popup.innerHTML = `<strong>${data.term}</strong><br><br>${data.short_definition}`;

        if (data.is_cs_term) {
          let btn = document.createElement('button');
          btn.innerText = "Explore in C >";
          btn.style.marginTop = "12px";
          btn.style.padding = "6px 12px";
          btn.style.backgroundColor = "#4CAF50";
          btn.style.color = "#fff";
          btn.style.border = "none";
          btn.style.borderRadius = "4px";
          btn.style.cursor = "pointer";
          btn.style.width = "100%";

          btn.onmousedown = (e) => {
            e.stopPropagation();
            popup.remove();
            openSidebar(data);
          };
          popup.appendChild(btn);
        }
      })
      .catch(error => {
        popup.innerHTML = `<strong>Error:</strong> Could not connect to local server.`;
      });
  }
});

document.addEventListener('mousedown', (event) => {
  let popup = document.getElementById('cs-term-popup');
  if (popup && event.target !== popup && !popup.contains(event.target)) {
    popup.remove();
  }
});

function openSidebar(data) {
  let existingSidebar = document.getElementById('cs-term-sidebar');
  if (existingSidebar) existingSidebar.remove();

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
  contentContainer.style.height = '100%';
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

  // Updated Sidebar HTML Structure
  contentContainer.innerHTML = `
    <button id="close-sidebar" style="float:right; background:none; border:none; color:#e8e6e3; font-size:20px; cursor:pointer;">&times;</button>
    <h2 style="margin-top:0; color:#4CAF50;">${data.term}</h2>
    
    <h3 style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 4px;">Definition</h3>
    <p style="color:#aaa; line-height: 1.5; margin-top: 8px;">${data.detailed_definition}</p>
    
    <h3 style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 4px;">Analogy</h3>
    <p style="color:#aaa; line-height: 1.5; margin-top: 8px;">${data.analogy}</p>
    
    <h3 style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 4px;">Use Case</h3>
    <p style="color:#aaa; line-height: 1.5; margin-top: 8px;">${data.use_case}</p>
    
    <h3 style="margin-top: 24px; border-bottom: 1px solid #333; padding-bottom: 4px;">C Implementation</h3>
    <pre style="background:#000; padding:12px; border-radius:6px; overflow-x:auto;"><code>${escapeHTML(data.c_code_example)}</code></pre>
    
    <hr style="border-color:#333; margin: 30px 0;">
    
    <!-- Opt-in Button -->
    <div id="quiz-toggle-container" style="text-align: center;">
        <button id="show-quiz-btn" style="padding:10px 20px; background:#007acc; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; width: 100%;">Test Your Knowledge</button>
    </div>

    <!-- Hidden Quiz Section -->
    <div id="quiz-section" style="display:none;">
        <h3 style="color: #007acc;">Knowledge Check</h3>
        <p style="line-height: 1.4;">${data.quiz_question}</p>
        <textarea id="quiz-answer" placeholder="Type your answer here..." rows="1" style="width:100%; padding:8px; margin-bottom:10px; background:#222; color:#fff; border:1px solid #444; border-radius:4px; resize:none; overflow:hidden; font-family:sans-serif; box-sizing:border-box;"></textarea>
        <button id="submit-quiz" style="padding:8px 16px; background:#4CAF50; color:#fff; border:none; border-radius:4px; cursor:pointer;">Submit</button>
        <div id="quiz-feedback" style="margin-top:12px; padding: 10px; border-radius: 4px; display: none; line-height: 1.4;"></div>
    </div>
  `;

  sidebar.appendChild(resizer);
  sidebar.appendChild(contentContainer);
  document.body.appendChild(sidebar);

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

  document.getElementById('close-sidebar').onclick = () => sidebar.remove();
}
