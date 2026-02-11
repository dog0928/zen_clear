const send = (message, callback = () => {}) => {
  chrome.runtime.sendMessage({ type: 'ZEN_RELAY_TO_TAB', payload: message }, callback);
};

for (const id of ['initial-button-1', 'initial-button-2'])
  document.getElementById(id).onclick = () => send({ type: id });
