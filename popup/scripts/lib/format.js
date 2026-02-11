export const formatTimeFromSeconds = (seconds) => {
	const safeSeconds = Math.max(0, Math.round(seconds ?? 0));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const fullMinutes = Math.floor(safeSeconds / 60);
	const restSeconds = safeSeconds % 60;

	return { hours, minutes, fullMinutes, seconds: restSeconds };
};

export const formatFullTimeText = (seconds) => {
	const { hours, minutes } = formatTimeFromSeconds(seconds);
	const paddedHours = String(hours).padStart(2, '0');
	const paddedMinutes = String(minutes).padStart(2, '0');
	return `${paddedHours}h${paddedMinutes}m`;
};

export const formatProgressAndGoalText = (currentSeconds, goalSeconds) => {
	const percent = goalSeconds > 0 ? Math.min(100, (currentSeconds / goalSeconds) * 100) : 0;
	const paddedPercent = String(Math.floor(percent)).padStart(3, '0');

	const currentText = formatFullTimeText(currentSeconds);
	const goalText = formatFullTimeText(goalSeconds);
	return { Time: `${currentText} / ${goalText}`, Percent: `${paddedPercent}%` };
};

export const formatCompactDateText = (date) => {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		return '--/--';
	}

	return `${date.getMonth() + 1}/${date.getDate()}`;
};

export const calcScheduleDates = (year, month, daysBeforeDeadline) => {
	const safeDays = Math.max(0, Number(daysBeforeDeadline ?? 0));
	const dueDate = new Date(year, month - 1, 15);
	const finishDate = new Date(dueDate);
	finishDate.setDate(dueDate.getDate() - safeDays);
	return { dueDate, finishDate };
};

export const formatReportCountText = (completedCount, totalCount) => (
	`${completedCount} / ${totalCount} 件`
);
