const send = (message, callback = () => {}) => {
  chrome.runtime.sendMessage({ type: 'ZEN_RELAY_TO_TAB', payload: message }, callback);
};

send({ type: 'get-question' }, question => {
  document.getElementById('question').textContent = question.question;
  document.getElementById('answer').textContent = '答え: ' + question.answer;
  document.getElementById('description').textContent = question.description;
});

send({ type: 'get-last-answer' }, answer => {
  document.getElementById('incorrect-input-1').value = answer;
});

for (const id of ['incorrect-button-1'])
  document.getElementById(id).onclick = () => send({ type: id });
