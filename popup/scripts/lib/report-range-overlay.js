import { REPORT_RANGE_MONTHS } from './constants.js';
import { fetchMonthlyReportsTimeProgressWithSummary, flatTimeProgress } from '../zenTimeApi.js';
import { formatProgressAndGoalText, formatReportCountText } from './format.js';

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

export const setupReportRangeOverlay = () => {
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
