import {
	fetchMonthlyReportsTimeProgress,
	fetchMonthlyReportsCompletionSummary,
} from '../zenTimeApi.js';
import { getCurrentMonthlyReportInfo } from './monthly-report.js';
import { formatProgressAndGoalText, formatReportCountText } from './format.js';

export const updateCurrentMonth = async (targetElement) => {
	if (!targetElement) {
		return;
	}

	const monthlyReportInfo = await getCurrentMonthlyReportInfo();
	targetElement.textContent = String(monthlyReportInfo.month).padStart(2, '0');
};

export const updateReportTime = async (targetElement, percentElement) => {
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

export const updateReportCount = async (targetElement) => {
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
