(() => {
	const DEFAULT_PATH_PREFIX = '';
	const BUTTON_CLASS = 'zen-csv-calendar-btn';
	const REMINDER_BUTTON_CLASS = 'zen-csv-reminder-btn';
	const ACTIONS_CLASS = 'zen-csv-calendar-actions';
	const STYLE_ID = 'zen-csv-calendar-style';
	const PROCESSED_ATTR = 'data-zen-csv-calendar-attached';
	const IMPORT_URL = 'https://calendar.google.com/calendar/u/0/r/settings/export';

	const getChatGptPathPrefix = () => {
		const prefix = globalThis.ZEN_CONFIG?.chatgpt?.pathPrefix;
		if (typeof prefix !== 'string') {
			return DEFAULT_PATH_PREFIX;
		}
		return prefix.trim();
	};

	const shouldRunOnPath = () => {
		const prefix = getChatGptPathPrefix();
		if (!prefix) {
			return true;
		}
		return location.pathname.startsWith(prefix);
	};

	let hasCodeBlock = false;
	let started = false;

	const injectStyle = () => {
		if (document.getElementById(STYLE_ID)) {
			return;
		}
		const style = document.createElement('style');
		style.id = STYLE_ID;
		style.textContent = `
			pre.${BUTTON_CLASS}-container { position: relative; }
			.${ACTIONS_CLASS} {
				position: absolute;
				top: 6px;
				right: 8px;
				z-index: 5;
				display: flex;
				gap: 6px;
				flex-wrap: wrap;
				align-items: center;
			}
			.${BUTTON_CLASS},
			.${REMINDER_BUTTON_CLASS} {
				font-size: 12px;
				padding: 4px 8px;
				border-radius: 6px;
				border: 1px solid #cbd2d9;
				background: #f7fafc;
				color: #1f2933;
				box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
				cursor: pointer;
				transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease;
				font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			}
			.${BUTTON_CLASS}:hover,
			.${REMINDER_BUTTON_CLASS}:hover {
				transform: translateY(-1px);
				box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
				background: #eef2f7;
			}
			.${BUTTON_CLASS}:active,
			.${REMINDER_BUTTON_CLASS}:active {
				transform: translateY(0);
				box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
			}
		`;
		document.head.appendChild(style);
	};

	const parseCsvLine = (line) => {
		const cells = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i += 1) {
			const ch = line[i];
			if (inQuotes) {
				if (ch === '"') {
					if (line[i + 1] === '"') {
						current += '"';
						i += 1;
					} else {
						inQuotes = false;
					}
				} else {
					current += ch;
				}
			} else if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				cells.push(current.trim());
				current = '';
			} else {
				current += ch;
			}
		}
		cells.push(current.trim());
		return cells;
	};

	const normalizeLine = (line) => line.replace(/^\uFEFF/, '').trim();

	const splitCsv = (text) => (
		text
			.split(/\r?\n/)
			.map(normalizeLine)
			.filter((line) => line.length > 0)
	);

	const tryParseDate = (value) => {
		if (!value) return null;
		const trimmed = value.trim();
		if (!trimmed) return null;

		const direct = new Date(trimmed);
		if (!Number.isNaN(direct.getTime())) {
			return direct;
		}

		const match = trimmed.match(/(\d{4})[/. -](\d{1,2})[/. -](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
		if (match) {
			const [ , y, m, d, hh = '0', mm = '0', ss = '0'] = match;
			return new Date(
				Number(y),
				Number(m) - 1,
				Number(d),
				Number(hh),
				Number(mm),
				Number(ss),
				0,
			);
		}

		return null;
	};

	const parseDateTimeParts = (datePart, timePart) => {
		const dateStr = (datePart ?? '').trim();
		let timeStr = (timePart ?? '').trim();

		if (dateStr && !timeStr) {
			const split = dateStr.split(/\s+/);
			if (split.length > 1) {
				timeStr = split.slice(1).join(' ');
			}
		}

		const combined = [dateStr, timeStr].filter(Boolean).join(' ');
		const parsed = tryParseDate(combined) ?? tryParseDate(dateStr);
		if (!parsed) {
			return null;
		}

		const hasTime = Boolean(timeStr) || /T\d{2}:\d{2}/.test(dateStr);
		return { date: parsed, hasTime };
	};

	const formatICSDate = (date, withTime) => {
		const pad = (n, len = 2) => String(n).padStart(len, '0');
		const y = date.getFullYear();
		const m = pad(date.getMonth() + 1);
		const d = pad(date.getDate());
		if (!withTime) {
			return `${y}${m}${d}`;
		}
		return `${y}${m}${d}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	};

	const mapHeaders = (headers) => {
		const lowered = headers.map((h) => h.toLowerCase());
		const findIndex = (candidates) => lowered.findIndex((h) => candidates.some((c) => h.includes(c)));
		return {
			title: findIndex(['title', '件名', 'summary', 'subject', '科目', 'name']),
			startDate: findIndex(['start', '開始', 'date', '日付', 'start_date']),
			startTime: findIndex(['start_time', '開始時刻', '開始時間']),
			endDate: findIndex(['end', '終了', 'finish', 'end_date']),
			endTime: findIndex(['end_time', '終了時刻', '終了時間']),
			description: findIndex(['description', 'memo', 'メモ', '備考', 'note']),
			location: findIndex(['location', '場所', '会場']),
		};
	};

	const buildEvent = (row, headerMap) => {
		const pick = (idx) => (idx >= 0 ? row[idx] ?? '' : '');
		let title = pick(headerMap.title).trim() || '予定';
		const startDateRaw = pick(headerMap.startDate);
		const startTimeRaw = pick(headerMap.startTime);
		const endDateRaw = pick(headerMap.endDate);
		const endTimeRaw = pick(headerMap.endTime);
		const description = pick(headerMap.description);
		const location = pick(headerMap.location);

		const start = parseDateTimeParts(startDateRaw, startTimeRaw);
		if (!start) {
			return null;
		}

		let end = parseDateTimeParts(endDateRaw || startDateRaw, endTimeRaw);
		if (!end) {
			const fallback = new Date(start.date);
			if (start.hasTime) {
				fallback.setHours(fallback.getHours() + 1);
			} else {
				fallback.setDate(fallback.getDate() + 1);
			}
			end = { date: fallback, hasTime: start.hasTime };
		}

		return {
			title,
			description,
			location,
			startDate: start.date,
			endDate: end.date,
			hasTime: start.hasTime,
		};
	};

	const parseEventsFromCsv = (text) => {
		const lines = splitCsv(text);
		if (lines.length < 2) {
			return [];
		}

		const header = parseCsvLine(lines[0]);
		const headerMap = mapHeaders(header);

		if (headerMap.startDate < 0) {
			return [];
		}

		const events = [];
		for (const line of lines.slice(1)) {
			const row = parseCsvLine(line);
			const event = buildEvent(row, headerMap);
			if (event) {
				events.push(event);
			}
		}
		return events;
	};

	const buildICS = (events) => {
		const lines = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//zen-csv-to-calendar//EN',
		];
		const now = new Date();
		const stamp = formatICSDate(now, true);

		for (const event of events) {
			const uid = `${stamp}-${Math.random().toString(36).slice(2)}@zen-csv-calendar`;
			lines.push('BEGIN:VEVENT');
			lines.push(`UID:${uid}`);
			lines.push(`DTSTAMP:${stamp}`);
			if (event.hasTime) {
				lines.push(`DTSTART:${formatICSDate(event.startDate, true)}`);
				lines.push(`DTEND:${formatICSDate(event.endDate, true)}`);
			} else {
				lines.push(`DTSTART;VALUE=DATE:${formatICSDate(event.startDate, false)}`);
				lines.push(`DTEND;VALUE=DATE:${formatICSDate(event.endDate, false)}`);
			}
			lines.push(`SUMMARY:${event.title}`);
			if (event.description) {
				lines.push(`DESCRIPTION:${event.description}`);
			}
			if (event.location) {
				lines.push(`LOCATION:${event.location}`);
			}
			lines.push('END:VEVENT');
		}

		lines.push('END:VCALENDAR');
		return lines.join('\r\n');
	};

	const downloadICS = (ics) => {
		const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `chatgpt-events-${Date.now()}.ics`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const buildReminderPayload = (events) => (
		events.map((event) => ({
			title: event.title,
			description: event.description,
			location: event.location,
			startAt: event.startDate.toISOString(),
			endAt: event.endDate.toISOString(),
			hasTime: event.hasTime,
		}))
	);

	const sendReminderAddRequest = (events) => new Promise((resolve) => {
		if (!chrome?.runtime?.sendMessage) {
			resolve({ ok: false });
			return;
		}

		chrome.runtime.sendMessage({ type: 'ZEN_REMINDER_ADD', events }, (response) => {
			if (chrome.runtime.lastError) {
				resolve({ ok: false });
				return;
			}
			resolve(response ?? { ok: false });
		});
	});

	const setButtonTemporaryText = (button, text) => {
		if (!button) {
			return () => {};
		}
		const original = button.textContent;
		button.textContent = text;
		return () => {
			button.textContent = original;
		};
	};

	const handleReminderClick = async (button, getCodeText) => {
		const codeText = typeof getCodeText === 'function' ? getCodeText() : '';
		const events = parseEventsFromCsv(codeText);
		if (!events.length) {
			window.alert('CSVから予定を認識できませんでした。ヘッダーに開始日/開始時間の列が含まれているか確認してください。');
			return;
		}

		const payload = buildReminderPayload(events);
		const resetLabel = setButtonTemporaryText(button, '保存中...');
		if (button) {
			button.disabled = true;
		}

		const result = await sendReminderAddRequest(payload);
		if (!result?.ok) {
			resetLabel();
			setButtonTemporaryText(button, '失敗');
		} else {
			const addedCount = Number(result.addedCount ?? 0);
			setButtonTemporaryText(button, addedCount ? `${addedCount}件保存` : '保存済み');
		}

		setTimeout(() => {
			resetLabel();
			if (button) {
				button.disabled = false;
			}
		}, 1400);
	};

	const handleConvertClick = (getCodeText) => {
		const codeText = typeof getCodeText === 'function' ? getCodeText() : '';
		const events = parseEventsFromCsv(codeText);
		if (!events.length) {
			window.alert('CSVから予定を認識できませんでした。ヘッダーに開始日/開始時間の列が含まれているか確認してください。');
			return;
		}

		const ics = buildICS(events);
		downloadICS(ics);
		window.open(IMPORT_URL, '_blank', 'noopener');
	};

	const ensureActionContainer = (pre) => {
		const existing = pre.querySelector(`.${ACTIONS_CLASS}`);
		if (existing) {
			return existing;
		}
		const container = document.createElement('div');
		container.className = ACTIONS_CLASS;
		pre.appendChild(container);
		return container;
	};

	const createActionButton = (className, label, onClick) => {
		const button = document.createElement('button');
		button.className = className;
		button.type = 'button';
		button.textContent = label;
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			onClick(button);
		});
		return button;
	};

	const attachButtonToCode = (codeEl) => {
		if (!shouldRunOnPath()) {
			return;
		}

		if (!codeEl || codeEl.closest(`[${PROCESSED_ATTR}]`)) {
			return;
		}

		const pre = codeEl.closest('pre');
		if (!pre) {
			return;
		}

		pre.setAttribute(PROCESSED_ATTR, 'true');
		pre.classList.add(`${BUTTON_CLASS}-container`);

		const container = ensureActionContainer(pre);
		const calendarButton = createActionButton(
			BUTTON_CLASS,
			'Googleカレンダーに追加',
			() => handleConvertClick(() => codeEl.textContent ?? ''),
		);
		const reminderButton = createActionButton(
			REMINDER_BUTTON_CLASS,
			'リマインダーを追加',
			(button) => handleReminderClick(button, () => codeEl.textContent ?? ''),
		);

		container.append(calendarButton, reminderButton);
	};

	const scanForCsvBlocks = () => {
		if (!shouldRunOnPath()) {
			hasCodeBlock = false;
			return;
		}
		const codes = document.querySelectorAll('pre code');
		for (const code of codes) {
			attachButtonToCode(code);
		}
		hasCodeBlock = codes.length > 0;
	};

	const initObserver = () => {
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (!(node instanceof HTMLElement)) {
						continue;
					}
					if (node.matches && node.matches('pre code')) {
						attachButtonToCode(node);
					} else {
						const codes = node.querySelectorAll ? node.querySelectorAll('pre code') : [];
						for (const code of codes) {
							attachButtonToCode(code);
						}
					}
				}
			}
			hasCodeBlock = document.querySelectorAll('pre code').length > 0;
		});

		observer.observe(document.body, { childList: true, subtree: true });
	};

	const start = () => {
		if (!shouldRunOnPath()) {
			return;
		}
		if (started) {
			return;
		}
		started = true;
		injectStyle();
		scanForCsvBlocks();
		initObserver();
	};

	const scheduleScan = () => {
		if (!started) {
			start();
			return;
		}
		scanForCsvBlocks();
	};

	const getLatestCodeText = () => {
		const codes = document.querySelectorAll('pre code');
		const last = codes[codes.length - 1];
		return last?.textContent ?? '';
	};

	const handleStatusRequest = (sendResponse) => {
		if (!shouldRunOnPath()) {
			sendResponse({ ok: false, hasCodeBlock: false });
			return;
		}
		sendResponse({ ok: true, hasCodeBlock });
	};

	const handleConvertRequest = (sendResponse) => {
		if (!shouldRunOnPath()) {
			sendResponse({ ok: false });
			return;
		}
		handleConvertClick(() => getLatestCodeText());
		sendResponse({ ok: true });
	};

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (!message || typeof message.type !== 'string') {
			return;
		}

		if (message.type === 'ZEN_CHATGPT_STATUS') {
			handleStatusRequest(sendResponse);
			return true;
		}

		if (message.type === 'ZEN_CHATGPT_CONVERT') {
			handleConvertRequest(sendResponse);
			return true;
		}

		if (message.type === 'ZEN_CHATGPT_FORCE_SCAN') {
			start();
			scanForCsvBlocks();
			sendResponse({ ok: true, hasCodeBlock });
			return true;
		}
	});

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			start();
			setInterval(scheduleScan, 1500);
		});
	} else {
		start();
		setInterval(scheduleScan, 1500);
	}
})();
