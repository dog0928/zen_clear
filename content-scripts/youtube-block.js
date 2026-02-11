(() => {
	const questions = [
		{
			question: "Q1. 高校範囲までで最も画数が多い漢字は？ (音読み/平仮名)",
			answer: "うつ",
			description: "高校範囲 (常用漢字および教育漢字) で最も画数が多い漢字は「鬱」で29画",
		},
		{
			question: "Q2. 全ての漢字の中で最も多い部首は？ (平仮名)",
			answer: "くさかんむり",
			description: "最も多い部首は「くさかんむり」で2173字",
		},
	];

	let blockOverlay = null;
	let questionIndex = 0;
	let lastAnswer = '';

	const sendMessage = (message) => new Promise((resolve) => {
		if (!chrome?.runtime?.sendMessage) {
			resolve(null);
			return;
		}
		chrome.runtime.sendMessage(message, (response) => {
			if (chrome.runtime.lastError) {
				resolve(null);
				return;
			}
			resolve(response);
		});
	});

	const setIframeSrc = (page) => {
		if (!blockOverlay) return;
		blockOverlay.src = chrome.runtime.getURL(`youtube-block/${page}`);
	};

	const showBlockScreen = () => {
		if (blockOverlay) return;

		questionIndex = 0;
		lastAnswer = '';

		blockOverlay = document.createElement('iframe');
		blockOverlay.src = chrome.runtime.getURL('youtube-block/initial.html');
		blockOverlay.style.cssText = [
			'border: none',
			'height: 100vh',
			'inset: 0',
			'position: fixed',
			'width: 100vw',
			'z-index: 2147483647',
		].join(';');
		document.documentElement.appendChild(blockOverlay);
	};

	const removeBlockScreen = () => {
		if (!blockOverlay) return;
		blockOverlay.remove();
		blockOverlay = null;
	};

	const completeAllOverdueReminders = async () => {
		const result = await sendMessage({ type: 'ZEN_GET_OVERDUE_REMINDERS' });
		const overdueReminders = result?.reminders ?? [];
		for (const reminder of overdueReminders) {
			await sendMessage({
				type: 'ZEN_REMINDER_COMPLETE',
				id: reminder.id,
				completed: true,
			});
		}
	};

	const checkAndBlock = async () => {
		const result = await sendMessage({ type: 'ZEN_CHECK_OVERDUE_REMINDERS' });
		if (result?.hasOverdue) {
			showBlockScreen();
		} else {
			removeBlockScreen();
		}
	};

	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (!message?.type) return;

		switch (message.type) {
			case 'get-question':
				sendResponse(questions[questionIndex]);
				break;
			case 'get-last-answer':
				sendResponse(lastAnswer);
				break;
			case 'initial-button-1':
				setIframeSrc('question.html');
				sendResponse();
				break;
			case 'initial-button-2':
				window.location.replace('https://www.nnn.ed.nico/home');
				sendResponse();
				break;
			case 'question-button-1':
				lastAnswer = message.answer;
				if (lastAnswer === questions[questionIndex].answer)
					setIframeSrc('answer.html');
				else
					setIframeSrc('incorrect.html');
				sendResponse();
				break;
			case 'answer-button-1':
				if (++questionIndex < questions.length)
					setIframeSrc('question.html');
				else
					setIframeSrc('complete.html');
				sendResponse();
				break;
			case 'incorrect-button-1':
				window.location.replace('https://www.nnn.ed.nico/home');
				sendResponse();
				break;
			case 'complete-button-1':
				window.location.replace('https://www.nnn.ed.nico/home');
				sendResponse();
				break;
			case 'complete-button-2':
				window.location.replace('https://www.nnn.ed.nico/home');
				sendResponse();
				break;
			case 'ZEN_YOUTUBE_UNBLOCK':
				removeBlockScreen();
				break;
			case 'ZEN_YOUTUBE_BLOCK':
				showBlockScreen();
				break;
		}
	});

	checkAndBlock();
})();

