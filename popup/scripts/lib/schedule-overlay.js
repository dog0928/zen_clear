import { DEFAULT_CHATGPT_URL } from './constants.js';
import {
	fetchMonthlyReportMeta,
	fetchMonthlyReportsCompletionSummary,
	fetchMonthlyReportsTimeProgress,
} from '../zenTimeApi.js';
import { getCurrentMonthlyReportInfo } from './monthly-report.js';
import { calcScheduleDates, formatCompactDateText, formatProgressAndGoalText } from './format.js';
import {
	collectSubjectNames,
	detectSpecialSubjects,
	fetchCourseProgressList,
	formatCourseProgressList,
} from './subjects.js';

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

export const setupScheduleOverlay = (chatGptConfig) => {
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
