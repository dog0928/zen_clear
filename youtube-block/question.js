const send = (message, callback = () => {}) => {
  chrome.runtime.sendMessage({ type: 'ZEN_RELAY_TO_TAB', payload: message }, callback);
};

send({ type: 'get-question' }, question => {
  document.getElementById('question').textContent = question.question;
});

for (const id of ['question-button-1']) {
  document.getElementById(id).onclick = () => {
    const input = document.getElementById('question-input-1');
    send({ type: id, answer: input.value });
  };
}
