import {
	fetchChapterTimeProgress,
	fetchCourseTimeProgress,
	fetchMonthlyReportsCompletionSummary,
	fetchMonthlyReportMeta,
	fetchMonthlyReportsTimeProgress,
	fetchMonthlyReportsTimeProgressWithSummary,
	flatTimeProgress,
	setZenStudyConfig,
} from './zenTimeApi.js';

const DEFAULT_ZEN_STUDY_SITE_ORIGIN = 'https://www.nnn.ed.nico';
const DEFAULT_CHATGPT_URL = 'https://chatgpt.com/';
const DEFAULT_CHATGPT_MATCH_PATTERNS = [
	'https://chatgpt.com/*',
	'https://chat.openai.com/*',
];
const REPORT_RANGE_MONTHS = [6, 7, 8, 9, 10, 11, 12];

const getZenConfig = () => globalThis.ZEN_CONFIG ?? {};

const normalizeOrigin = (origin, fallback) => {
	if (typeof origin !== 'string') {
		return fallback;
	}
	const trimmed = origin.trim();
	return trimmed ? trimmed.replace(/\/$/, '') : fallback;
};

const normalizeUrl = (url, fallback) => {
	try {
		return new URL(url).toString();
	} catch {
		return fallback;
	}
};

const normalizePatternList = (value, fallback) => {
	const patterns = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/[\r\n,]+/)
			: [];

	const cleaned = patterns.map((pattern) => pattern.trim()).filter(Boolean);
	return cleaned.length ? cleaned : fallback;
};

const getZenStudyConfig = () => ({
	siteOrigin: normalizeOrigin(getZenConfig()?.zenStudy?.siteOrigin, DEFAULT_ZEN_STUDY_SITE_ORIGIN),
});

const getChatGptConfig = () => ({
	homeUrl: normalizeUrl(getZenConfig()?.chatgpt?.homeUrl, DEFAULT_CHATGPT_URL),
	matchPatterns: normalizePatternList(
		getZenConfig()?.chatgpt?.matchPatterns,
		DEFAULT_CHATGPT_MATCH_PATTERNS,
	),
});

const buildMonthlyReportUrlPattern = (siteOrigin) => (
	`${normalizeOrigin(siteOrigin, DEFAULT_ZEN_STUDY_SITE_ORIGIN)}/study_plans/month/*`
);
let monthlyReportUrlPattern = buildMonthlyReportUrlPattern(DEFAULT_ZEN_STUDY_SITE_ORIGIN);

const setMonthlyReportUrlPattern = (siteOrigin) => {
	monthlyReportUrlPattern = buildMonthlyReportUrlPattern(siteOrigin);
};

const parseMonthlyReportUrl = (urlString) => {
	try {
		const url = new URL(urlString);
		const match = url.pathname.match(/^\/study_plans\/month\/(\d+)\/(\d+)\/?$/);

		if (!match) {
			return null;
		}

		const [, yearStr, monthStr] = match;
		const year = Number(yearStr);
		const month = Number(monthStr);

		if (Number.isNaN(year) || Number.isNaN(month)) {
			return null;
		}

		return { year, month };
	} catch {
		return null;
	}
};

const queryMonthlyReportTabs = () => new Promise((resolve, reject) => {
	if (!chrome?.tabs?.query) {
		resolve([]);
		return;
	}

	chrome.tabs.query({ url: monthlyReportUrlPattern }, (tabs) => {
		if (chrome.runtime.lastError) {
			reject(new Error(chrome.runtime.lastError.message));
			return;
		}

		resolve(tabs ?? []);
	});
});

const getCurrentMonthlyReportInfo = async () => {
	try {
		const tabs = await queryMonthlyReportTabs();

		const parseTab = (tab) => (tab?.url ? parseMonthlyReportUrl(tab.url) : null);

		const preferredTab = tabs.find((tab) => tab.active && parseTab(tab));
		const fallbackTab = tabs.find((tab) => parseTab(tab));
		const tabInfo = parseTab(preferredTab ?? fallbackTab);

		if (tabInfo) {
			return tabInfo;
		}
	} catch {
		// ignore and fallback to current date
	}

	const now = new Date();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
	};
};

const formatTimeFromSeconds = (seconds) => {
	const safeSeconds = Math.max(0, Math.round(seconds ?? 0));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const fullMinutes = Math.floor(safeSeconds / 60);
	const restSeconds = safeSeconds % 60;

	return { hours, minutes, fullMinutes, seconds: restSeconds };
};

const formatFullTimeText = (seconds) => {
	const { hours, minutes } = formatTimeFromSeconds(seconds);
	const paddedHours = String(hours).padStart(2, '0');
	const paddedMinutes = String(minutes).padStart(2, '0');
	return `${paddedHours}h${paddedMinutes}m`;
};

const formatProgressAndGoalText = (currentSeconds, goalSeconds) => {
	const percent = goalSeconds > 0 ? Math.min(100, (currentSeconds / goalSeconds) * 100) : 0;
	const paddedPercent = String(Math.floor(percent)).padStart(3, '0');

	const currentText = formatFullTimeText(currentSeconds);
	const goalText = formatFullTimeText(goalSeconds);
	return { Time :`${currentText} / ${goalText}`, Percent: `${paddedPercent}%` };
};

const formatCompactDateText = (date) => {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		return '--/--';
	}

	return `${date.getMonth() + 1}/${date.getDate()}`;
};

const calcScheduleDates = (year, month, daysBeforeDeadline) => {
	const safeDays = Math.max(0, Number(daysBeforeDeadline ?? 0));
	const dueDate = new Date(year, month - 1, 15);
	const finishDate = new Date(dueDate);
	finishDate.setDate(dueDate.getDate() - safeDays);
	return { dueDate, finishDate };
};

const formatReportCountText = (completedCount, totalCount) => (
	`${completedCount} / ${totalCount} 件`
);

const openExternalLink = async (url) => {
	try {
		if (chrome?.tabs?.create) {
			await chrome.tabs.create({ url });
			return;
		}
	} catch (error) {
		console.error('Failed to open link via chrome.tabs', error);
	}

	window.open(url, '_blank', 'noopener');
};

const updateCurrentMonth = async (targetElement) => {
	if (!targetElement) {
		return;
	}

	const monthlyReportInfo = await getCurrentMonthlyReportInfo();
	targetElement.textContent = String(monthlyReportInfo.month).padStart(2, '0');
};

const updateReportTime = async (targetElement, percentElement) => {
	try {
		targetElement.textContent = '取得中...';

		const monthlyReportInfo = await getCurrentMonthlyReportInfo();
		const timeProgress = await fetchMonthlyReportsTimeProgress(monthlyReportInfo);
		const goalSeconds = timeProgress.primary.goal;
		const currentSeconds = timeProgress.primary.current;

		const { Time, Percent } = formatProgressAndGoalText(currentSeconds, goalSeconds);
		targetElement.innerText = Time;
		if (percentElement) {
			percentElement.textContent = Percent;
		}
		
	} catch (error) {
		console.error('Failed to fetch report time', error);

		if (error?.code === 'ZEN_TAB_NOT_FOUND') {
			targetElement.textContent = 'ZENページ未検出';
			return;
		}

		if (error?.status === 401) {
			targetElement.textContent = 'ログイン情報を確認';
			return;
		}

		targetElement.textContent = '取得失敗';
	}
};

const IGNORE_SUBJECT_PATTERNS = [
	/普通科/,
	/大修館書店版/,
	/光村図書版/,
	/第一学習社版/,
];

const isIgnorableSubjectName = (name) => IGNORE_SUBJECT_PATTERNS.some((pattern) => pattern.test(name));

const detectSpecialSubjects = (monthlyReport) => {
	const names = new Set();
	const appendName = (value) => {
		if (typeof value === 'string' && value.trim() && !isIgnorableSubjectName(value)) {
			names.add(value.trim());
		}
	};

	const collectFromChapter = (chapter) => {
		if (!chapter) {
			return;
		}
		appendName(chapter.course_name);
		appendName(chapter.course_title);
		appendName(chapter.title);
		appendName(chapter.name);
		appendName(chapter?.course?.name);
		appendName(chapter?.course?.title);
	};

	const collectFromGroup = (group) => {
		if (!group) {
			return;
		}
		appendName(group.course_name);
		appendName(group.course_title);
		appendName(group.name);
		appendName(group.title);
		appendName(group?.course?.name);
		appendName(group?.course?.title);

		if (Array.isArray(group.chapters)) {
			for (const chapter of group.chapters) {
				collectFromChapter(chapter);
			}
		}
	};

	if (Array.isArray(monthlyReport?.deadline_groups)) {
		for (const group of monthlyReport.deadline_groups) {
			collectFromGroup(group);
		}
	}

	if (Array.isArray(monthlyReport?.completed_chapters)) {
		for (const chapter of monthlyReport.completed_chapters) {
			collectFromChapter(chapter);
		}
	}

	if (Array.isArray(monthlyReport?.courses)) {
		for (const course of monthlyReport.courses) {
			appendName(course?.name);
			appendName(course?.title);
		}
	}

	const nameList = Array.from(names);
	let hasPE = nameList.some((name) => name.includes('体育'));
	let hasHomeEc = nameList.some((name) => name.includes('家庭'));

	if (!(hasPE && hasHomeEc)) {
		try {
			const serialized = JSON.stringify(monthlyReport) ?? '';
			hasPE = hasPE || serialized.includes('体育');
			hasHomeEc = hasHomeEc || serialized.includes('家庭');
		} catch (error) {
			console.warn('Failed to stringify monthlyReport for subject detection', error);
		}
	}

	return { hasPE, hasHomeEc };
};

const queryChatGptTab = (matchPatterns) => new Promise((resolve) => {
	if (!chrome?.tabs?.query) {
		resolve(null);
		return;
	}

	const patterns = Array.isArray(matchPatterns) && matchPatterns.length
		? matchPatterns
		: DEFAULT_CHATGPT_MATCH_PATTERNS;

	chrome.tabs.query({ url: patterns }, (tabs) => {
		if (chrome.runtime.lastError) {
			console.error('Failed to query chatgpt tabs', chrome.runtime.lastError);
			resolve(null);
			return;
		}

		resolve(tabs?.[0] ?? null);
	});
});

const requestChatGptStatus = async (tabId) => new Promise((resolve) => {
	if (!tabId) {
		resolve({ ok: false, hasCodeBlock: false });
		return;
	}

	chrome.tabs.sendMessage(tabId, { type: 'ZEN_CHATGPT_STATUS' }, (response) => {
		if (chrome.runtime.lastError) {
			console.warn('ChatGPT status message error', chrome.runtime.lastError);
			resolve({ ok: false, hasCodeBlock: false });
			return;
		}
		resolve(response ?? { ok: false, hasCodeBlock: false });
	});
});

const requestChatGptConvert = async (tabId) => new Promise((resolve) => {
	if (!tabId) {
		resolve({ ok: false });
		return;
	}

	chrome.tabs.sendMessage(tabId, { type: 'ZEN_CHATGPT_CONVERT' }, (response) => {
		if (chrome.runtime.lastError) {
			console.warn('ChatGPT convert message error', chrome.runtime.lastError);
			resolve({ ok: false });
			return;
		}
		resolve(response ?? { ok: false });
	});
});

const collectSubjectNames = (monthlyReport) => {
	const names = new Set();
	const appendName = (value) => {
		if (typeof value === 'string' && value.trim() && !isIgnorableSubjectName(value)) {
			names.add(value.trim());
		}
	};

	const collectFromChapter = (chapter) => {
		if (!chapter) {
			return;
		}
		appendName(chapter.course_name);
		appendName(chapter.course_title);
		appendName(chapter.title);
		appendName(chapter.name);
		appendName(chapter?.course?.name);
		appendName(chapter?.course?.title);
	};

	const collectFromGroup = (group) => {
		if (!group) {
			return;
		}
		appendName(group.course_name);
		appendName(group.course_title);
		appendName(group.name);
		appendName(group.title);
		appendName(group?.course?.name);
		appendName(group?.course?.title);

		if (Array.isArray(group.chapters)) {
			for (const chapter of group.chapters) {
				collectFromChapter(chapter);
			}
		}
	};

	if (Array.isArray(monthlyReport?.courses)) {
		for (const course of monthlyReport.courses) {
			appendName(course?.name);
			appendName(course?.title);
		}
	}

	if (Array.isArray(monthlyReport?.deadline_groups)) {
		for (const group of monthlyReport.deadline_groups) {
			collectFromGroup(group);
		}
	}

	if (Array.isArray(monthlyReport?.completed_chapters)) {
		for (const chapter of monthlyReport.completed_chapters) {
			collectFromChapter(chapter);
		}
	}

	const knownKeywords = [
		'国語', '現代文', '古典', '数学', '算数', '理科', '生物', '化学', '物理', '地学',
		'社会', '地理', '歴史', '日本史', '世界史', '公民', '政治', '経済', '倫理',
		'英語', '英会話', '外国語', '中国語', '韓国語', 'フランス語', 'ドイツ語',
		'体育', '保健', '家庭', '家庭科', '家庭総合', '技術', '情報', '美術', '音楽', '書道',
		'商業', '簿記', 'デザイン', '表現',
	];

	try {
		const serialized = JSON.stringify(monthlyReport) ?? '';
		for (const keyword of knownKeywords) {
			if (serialized.includes(keyword)) {
				names.add(keyword);
			}
		}
	} catch (error) {
		console.warn('Failed to stringify monthlyReport for subject collection', error);
	}

	return Array.from(names);
};

const buildCourseChapterMap = (monthlyReport) => {
	const map = new Map();

	const appendChapter = (chapter, fallbackName) => {
		if (!chapter || typeof chapter.course_id !== 'number' || typeof chapter.chapter_id !== 'number') {
			return;
		}

		const courseId = chapter.course_id;
		const courseName = (() => {
			const candidate = (
				chapter.course_name
				|| chapter.course_title
				|| chapter.title
				|| chapter.name
				|| chapter?.course?.name
				|| chapter?.course?.title
				|| fallbackName
			);
			return typeof candidate === 'string' ? candidate.trim() : '';
		})();

		if (!map.has(courseId)) {
			map.set(courseId, {
				courseId,
				name: courseName || `科目${courseId}`,
				chapters: new Set(),
			});
		}

		const entry = map.get(courseId);
		if (courseName && !isIgnorableSubjectName(courseName)) {
			entry.name = courseName;
		}
		entry.chapters.add(chapter.chapter_id);
	};

	if (Array.isArray(monthlyReport?.courses)) {
		for (const course of monthlyReport.courses) {
			appendChapter(
				{ course_id: course.id, chapter_id: -1, course_name: course.name || course.title },
				course.name || course.title,
			);
		}
	}

	if (Array.isArray(monthlyReport?.deadline_groups)) {
		for (const group of monthlyReport.deadline_groups) {
			for (const chapter of group?.chapters ?? []) {
				appendChapter(chapter, group?.course_name || group?.name);
			}
		}
	}

	if (Array.isArray(monthlyReport?.completed_chapters)) {
		for (const chapter of monthlyReport.completed_chapters) {
			appendChapter(chapter);
		}
	}

	// Remove placeholder chapters without real chapter_id
	for (const entry of map.values()) {
		entry.chapters = new Set(Array.from(entry.chapters).filter((id) => id >= 0));
	}

	return map;
};

const fetchCourseProgressList = async (monthlyReport) => {
	const courseMap = buildCourseChapterMap(monthlyReport);
	const results = [];

	for (const entry of courseMap.values()) {
		if (isIgnorableSubjectName(entry.name)) {
			continue;
		}

		const chapterIds = Array.from(entry.chapters);
		let timeProgress = { primary: { goal: 0, current: 0 }, groups: [] };

		if (chapterIds.length) {
			const timeProgressList = await Promise.all(
				chapterIds.map((chapterId) => fetchChapterTimeProgress({
					courseId: entry.courseId,
					chapterId,
				})),
			);
			timeProgress = flatTimeProgress(timeProgressList);
		} else {
			try {
				timeProgress = await fetchCourseTimeProgress({ courseId: entry.courseId });
			} catch (error) {
				console.warn('Failed to fetch course time progress; skipping', entry.courseId, error);
				continue;
			}
		}

		results.push({
			name: entry.name,
			progress: timeProgress,
		});
	}

	return results;
};

const formatCourseProgressList = (courseProgressList) => {
	if (!Array.isArray(courseProgressList) || !courseProgressList.length) {
		return '';
	}

	const items = courseProgressList.map((item) => {
		const { Time, Percent } = formatProgressAndGoalText(
			item.progress?.primary?.current ?? 0,
			item.progress?.primary?.goal ?? 0,
		);
		return `${item.name}:${Time}(${Percent})`;
	});

	return items.join(' / ');
};

const updateReportCount = async (targetElement) => {
	try {
		targetElement.textContent = '取得中...';

		const monthlyReportInfo = await getCurrentMonthlyReportInfo();
		const { completedCount, totalCount } = await fetchMonthlyReportsCompletionSummary(monthlyReportInfo);

		targetElement.textContent = formatReportCountText(completedCount, totalCount);
	} catch (error) {
		console.error('Failed to fetch report count', error);

		if (error?.code === 'ZEN_TAB_NOT_FOUND') {
			targetElement.textContent = 'ZENページ未検出';
			return;
		}

		if (error?.status === 401) {
			targetElement.textContent = 'ログイン情報を確認';
			return;
		}

		targetElement.textContent = '取得失敗';
	}
};

document.addEventListener('DOMContentLoaded', () => {
	const zenStudyConfig = getZenStudyConfig();
	setZenStudyConfig(zenStudyConfig);
	setMonthlyReportUrlPattern(zenStudyConfig.siteOrigin);

	const chatGptConfig = getChatGptConfig();

	const monthElement = document.querySelector('.month');
	const remainingTimeElement = document.querySelector('[data-remaining-report-time]');
	const ramainingPercentElement = document.querySelector('[data-remaining-report-percent]');
	const reportCountElement = document.querySelector('[data-deadline-report-count]');
	const calendarButton = document.getElementById('calendarBTN');

	if (monthElement) {
		updateCurrentMonth(monthElement);
	}
	if (remainingTimeElement) {
		updateReportTime(remainingTimeElement, ramainingPercentElement);
	}
	if (reportCountElement) {
		updateReportCount(reportCountElement);
	}

	setupReportRangeOverlay();
	setupScheduleOverlay(chatGptConfig);
	setupCalendarButton(calendarButton, chatGptConfig);
});

const buildReportRangePageInfos = (year) => (
	REPORT_RANGE_MONTHS.map((month) => ({ year, month }))
);

const createReportRangeRow = (rangeItem) => {
	const row = document.createElement('div');
	row.className = 'report-range-overlay__row';

	const label = document.createElement('strong');
	label.textContent = `${rangeItem.year}年${String(rangeItem.month).padStart(2, '0')}月`;

	const value = document.createElement('div');
	value.className = 'report-range-overlay__details';
	const { Time, Percent } = formatProgressAndGoalText(
		rangeItem.progress.primary.current,
		rangeItem.progress.primary.goal,
	);
	const countText = formatReportCountText(
		rangeItem.summary?.completedCount ?? 0,
		rangeItem.summary?.totalCount ?? 0,
	);

	const timeText = document.createElement('span');
	timeText.textContent = `${Time} (${Percent})`;

	const countElement = document.createElement('span');
	countElement.textContent = countText;

	value.append(timeText, countElement);

	row.append(label, value);
	return row;
};

const renderReportRangeResults = (resultsElement, summaryElement, rangeResults) => {
	resultsElement.innerHTML = '';

	if (!rangeResults.length) {
		const placeholder = document.createElement('p');
		placeholder.className = 'report-range-overlay__placeholder';
		placeholder.textContent = '対象月のデータがありません';
		resultsElement.appendChild(placeholder);
		summaryElement.textContent = `合計: 00h00m / 00h00m (000%) | ${formatReportCountText(0, 0)}`;
		return;
	}

	for (const rangeItem of rangeResults) {
		resultsElement.appendChild(createReportRangeRow(rangeItem));
	}

	const summaryProgress = flatTimeProgress(rangeResults.map((item) => item.progress));
	const { Time, Percent } = formatProgressAndGoalText(
		summaryProgress.primary.current,
		summaryProgress.primary.goal,
	);
	const summaryCounts = rangeResults.reduce(
		(acc, item) => ({
			completedCount: acc.completedCount + (item.summary?.completedCount ?? 0),
			totalCount: acc.totalCount + (item.summary?.totalCount ?? 0),
		}),
		{ completedCount: 0, totalCount: 0 },
	);
	summaryElement.textContent = `合計: ${Time} (${Percent}) | ${formatReportCountText(
		summaryCounts.completedCount,
		summaryCounts.totalCount,
	)}`;
};

const setupReportRangeOverlay = () => {
	const overlay = document.querySelector('[data-report-range-overlay]');
	const openButton = document.getElementById('analysisBTN');

	if (!overlay || !openButton) {
		return;
	}

	const closeButton = overlay.querySelector('[data-report-range-overlay-close]');
	const fetchButton = overlay.querySelector('[data-report-range-fetch]');
	const yearInput = overlay.querySelector('[data-report-range-year]');
	const resultsElement = overlay.querySelector('[data-report-range-results]');
	const summaryElement = overlay.querySelector('[data-report-range-summary]');

	const now = new Date();
	const defaultYear = now.getFullYear();
	if (yearInput && !yearInput.value) {
		yearInput.value = defaultYear;
	}

	const setOverlayOpen = (isOpen) => {
		overlay.classList.toggle('is-open', isOpen);
	};

	const showPlaceholder = (text) => {
		if (!resultsElement) {
			return;
		}

		resultsElement.innerHTML = '';
		const placeholder = document.createElement('p');
		placeholder.className = 'report-range-overlay__placeholder';
		placeholder.textContent = text;
		resultsElement.appendChild(placeholder);
	};

	let isFetching = false;

	const handleFetch = async () => {
		if (isFetching) {
			return;
		}

		const targetYear = Number(yearInput?.value ?? defaultYear);
		if (!Number.isFinite(targetYear)) {
			summaryElement.textContent = '年の入力を確認してください';
			return;
		}

		isFetching = true;
		summaryElement.textContent = '取得中...';
		showPlaceholder('取得中...');

		try {
			const pageInfos = buildReportRangePageInfos(targetYear);
			const rangeResults = await Promise.all(
				pageInfos.map(async (pageInfo) => ({
					...pageInfo,
					...(await fetchMonthlyReportsTimeProgressWithSummary(pageInfo)),
				})),
			);
			renderReportRangeResults(resultsElement, summaryElement, rangeResults);
		} catch (error) {
			console.error('Failed to fetch report range time', error);
			if (error?.code === 'ZEN_TAB_NOT_FOUND') {
				summaryElement.textContent = 'ZENページを開いた状態で再実行してください';
			} else if (error?.status === 401) {
				summaryElement.textContent = 'ログイン情報を確認してください';
			} else {
				summaryElement.textContent = '取得に失敗しました';
			}
			showPlaceholder('データを取得できませんでした');
		} finally {
			isFetching = false;
		}
	};

	openButton.addEventListener('click', () => {
		setOverlayOpen(true);
		handleFetch();
	});

	closeButton?.addEventListener('click', () => setOverlayOpen(false));
	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			setOverlayOpen(false);
		}
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			setOverlayOpen(false);
		}
	});
	fetchButton?.addEventListener('click', handleFetch);
};

const setupScheduleOverlay = (chatGptConfig) => {
	const overlay = document.querySelector('[data-schedule-overlay]');
	const openButton = document.getElementById('scheduleBTN');

	if (!overlay || !openButton) {
		return;
	}

	const closeButton = overlay.querySelector('[data-schedule-overlay-close]');
	const generateButton = overlay.querySelector('[data-schedule-generate]');
	const copyButton = overlay.querySelector('[data-schedule-copy]');
	const promptTextarea = overlay.querySelector('[data-schedule-prompt]');
	const statusElement = overlay.querySelector('[data-schedule-status]');
	const metaElement = overlay.querySelector('[data-schedule-meta]');
	const studyModeSelect = overlay.querySelector('[data-schedule-study-mode]');
	const studyValueInput = overlay.querySelector('[data-schedule-study-value]');
	const daysBeforeInput = overlay.querySelector('[data-schedule-days-before]');
	const gptButton = overlay.querySelector('[data-schedule-gpt]');
	const chatGptUrl = chatGptConfig?.homeUrl ?? DEFAULT_CHATGPT_URL;

	let scheduleSource = null;
	let isFetching = false;

	const parseDaysBefore = () => {
		const raw = Number(daysBeforeInput?.value);
		if (!Number.isFinite(raw) || raw < 0) {
			return 0;
		}
		return Math.floor(raw);
	};

	const refreshStudyPlaceholder = () => {
		if (!studyModeSelect || !studyValueInput) {
			return;
		}

		studyValueInput.placeholder = studyModeSelect.value === 'daily-time'
			? '例: 1日2時間'
			: '例: 3日に1回';
	};

	const resetPrompt = () => {
		if (promptTextarea) {
			promptTextarea.value = '';
		}
		if (copyButton) {
			copyButton.disabled = true;
			copyButton.textContent = 'コピー';
		}
		if (statusElement) {
			statusElement.textContent = '';
		}
	};

	const setOverlayOpen = (isOpen) => {
		overlay.classList.toggle('is-open', isOpen);

		if (isOpen) {
			resetPrompt();
			refreshStudyPlaceholder();
			loadScheduleSource();
		}
	};

	const renderMeta = () => {
		if (!metaElement) {
			return;
		}

		if (!scheduleSource) {
			metaElement.textContent = '対象月の情報を取得できませんでした';
			return;
		}

		const daysBefore = parseDaysBefore();
		const { year, month } = scheduleSource.monthlyInfo;
		const { dueDate, finishDate } = calcScheduleDates(year, month, daysBefore);
		const monthLabel = `${year}年${String(month).padStart(2, '0')}月`;
		const subjectsText = Array.isArray(scheduleSource.subjects) && scheduleSource.subjects.length
			? ` | 教科: ${scheduleSource.subjects.join(' / ')}`
			: '';
		metaElement.textContent = `対象: ${monthLabel} | 期限: ${formatCompactDateText(dueDate)} (毎月15日) | 完了目標: ${formatCompactDateText(finishDate)} (${daysBefore}日前)${subjectsText}`;
	};

	const loadScheduleSource = async () => {
		if (isFetching) {
			return;
		}

		isFetching = true;
		if (statusElement) {
			statusElement.textContent = '対象月の情報を取得中...';
		}

		try {
			const monthlyInfo = await getCurrentMonthlyReportInfo();
			const summary = await fetchMonthlyReportsCompletionSummary(monthlyInfo);
			const timeProgress = await fetchMonthlyReportsTimeProgress(monthlyInfo);
			const monthlyReport = await fetchMonthlyReportMeta(monthlyInfo);
			const specialSubjects = detectSpecialSubjects(monthlyReport);
			const subjects = collectSubjectNames(monthlyReport);
			const courseProgressList = await fetchCourseProgressList(monthlyReport);
			scheduleSource = {
				monthlyInfo,
				summary,
				timeProgress,
				specialSubjects,
				subjects,
				courseProgressList,
			};

			if (statusElement) {
				statusElement.textContent = '';
			}
		} catch (error) {
			console.error('Failed to fetch schedule info', error);
			scheduleSource = null;

			if (statusElement) {
				if (error?.code === 'ZEN_TAB_NOT_FOUND') {
					statusElement.textContent = 'ZENページ未検出';
				} else if (error?.status === 401) {
					statusElement.textContent = 'ログイン情報を確認';
				} else {
					statusElement.textContent = '情報取得に失敗しました';
				}
			}
		} finally {
			isFetching = false;
			renderMeta();
		}
	};

	const buildPrompt = () => {
		const studyRaw = (studyValueInput?.value ?? '').trim();
		if (!studyRaw) {
			if (statusElement) {
				statusElement.textContent = '学習頻度/1日の学習時間を入力してください';
			}
			return '';
		}

		if (!scheduleSource) {
			if (statusElement) {
				statusElement.textContent = '対象月の情報を取得できませんでした';
			}
			return '';
		}

		const studyMode = studyModeSelect?.value === 'daily-time' ? 'daily-time' : 'frequency';
		const studyText = studyMode === 'daily-time' ? `1日${studyRaw}` : studyRaw;

		const nowText = formatCompactDateText(new Date());
		const { year, month } = scheduleSource.monthlyInfo;
		const { totalCount } = scheduleSource.summary ?? {};
		const { Time, Percent } = formatProgressAndGoalText(
			scheduleSource.timeProgress?.primary?.current ?? 0,
			scheduleSource.timeProgress?.primary?.goal ?? 0,
		);
		const daysBefore = parseDaysBefore();
		const { dueDate, finishDate } = calcScheduleDates(year, month, daysBefore);
		const subjectText = Number.isFinite(totalCount) ? `${totalCount}教科` : '教科数不明';
		const hasPE = Boolean(scheduleSource.specialSubjects?.hasPE);
		const hasHomeEc = Boolean(scheduleSource.specialSubjects?.hasHomeEc);
		const specialText = hasPE && hasHomeEc
			? ' 体育と家庭科があります。'
			: hasPE
				? ' 体育があります。'
				: hasHomeEc
					? ' 家庭科があります。'
					: '';
		const subjectList = Array.isArray(scheduleSource.subjects) && scheduleSource.subjects.length
			? ` 教科一覧:${scheduleSource.subjects.join(' / ')}`
			: '';
		const perCourseText = formatCourseProgressList(scheduleSource.courseProgressList);
		const courseTimeText = perCourseText ? ` 教科時間:${perCourseText}` : '';

		return `現在:${nowText} 対象:${month}月 ${subjectText}${subjectList} 学習:${studyText} 時間:${Time}(${Percent})${courseTimeText} 完了目標:${formatCompactDateText(finishDate)}(締切${formatCompactDateText(dueDate)}の${daysBefore}日前)${specialText}`;
	};

	const handleGenerate = () => {
		renderMeta();
		const prompt = buildPrompt();
		if (!promptTextarea) {
			return;
		}

		if (!prompt) {
			promptTextarea.value = '';
			if (copyButton) {
				copyButton.disabled = true;
			}
			if (statusElement && !scheduleSource) {
				statusElement.textContent = '対象月の情報が取得できませんでした';
			} else if (statusElement) {
				statusElement.textContent = '';
			}
			return;
		}

		promptTextarea.value = prompt;
		if (copyButton) {
			copyButton.disabled = false;
			copyButton.textContent = 'コピー';
		}
		if (statusElement) {
			statusElement.textContent = '';
		}
	};

	const handleCopy = async () => {
		if (!promptTextarea) {
			return;
		}

		const text = (promptTextarea.value ?? '').trim();
		if (!text) {
			return;
		}

		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			console.error('Failed to copy prompt', error);
			try {
				promptTextarea.focus();
				promptTextarea.select();
				document.execCommand('copy');
			} catch (fallbackError) {
				console.error('Fallback copy failed', fallbackError);
				if (statusElement) {
					statusElement.textContent = 'コピーに失敗しました';
				}
				return;
			}
		}

		if (statusElement) {
			statusElement.textContent = 'クリップボードにコピーしました';
		}
		if (copyButton) {
			copyButton.textContent = 'コピー済み';
			setTimeout(() => {
				copyButton.textContent = 'コピー';
			}, 1200);
		}
	};

	openButton.addEventListener('click', () => setOverlayOpen(true));
	closeButton?.addEventListener('click', () => setOverlayOpen(false));
	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			setOverlayOpen(false);
		}
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			setOverlayOpen(false);
		}
	});
	generateButton?.addEventListener('click', handleGenerate);
	copyButton?.addEventListener('click', handleCopy);
	studyModeSelect?.addEventListener('change', refreshStudyPlaceholder);
	daysBeforeInput?.addEventListener('input', renderMeta);
	gptButton?.addEventListener('click', () => openExternalLink(chatGptUrl));
};

const setupCalendarButton = (button, chatGptConfig) => {
	if (!button) {
		return;
	}

	const matchPatterns = chatGptConfig?.matchPatterns ?? DEFAULT_CHATGPT_MATCH_PATTERNS;
	button.classList.add('is-hidden');

	const setButtonState = (state) => {
		if (state === 'hidden') {
			button.classList.add('is-hidden');
			button.disabled = true;
			return;
		}
		button.classList.remove('is-hidden');
		button.disabled = state === 'disabled';
	};

	const refresh = async () => {
		const tab = await queryChatGptTab(matchPatterns);
		if (!tab?.id) {
			setButtonState('hidden');
			return;
		}

		const status = await requestChatGptStatus(tab.id);
		if (!status?.ok) {
			setButtonState('hidden');
			return;
		}

		setButtonState(status.hasCodeBlock ? 'enabled' : 'disabled');
	};

	button.addEventListener('click', async () => {
		const tab = await queryChatGptTab(matchPatterns);
		if (!tab?.id) {
			setButtonState('hidden');
			return;
		}

		const result = await requestChatGptConvert(tab.id);
		if (!result?.ok) {
			button.textContent = '失敗';
			setTimeout(() => { button.textContent = 'GCal追加'; }, 1200);
		}
	});

	refresh();
	setInterval(refresh, 2000);
};
