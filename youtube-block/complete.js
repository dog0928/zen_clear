const send = (message, callback = () => {}) => {
  chrome.runtime.sendMessage({ type: 'ZEN_RELAY_TO_TAB', payload: message }, callback);
};

for (const id of ['complete-button-1', 'complete-button-2'])
  document.getElementById(id).onclick = () => send({ type: id });
