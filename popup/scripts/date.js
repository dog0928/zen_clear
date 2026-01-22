const newDate = new Date();

const formatter = new Intl.DateTimeFormat('ja-JP', {
	year: '2-digit',
	month: '2-digit',
	day: '2-digit',
});

const formattedDate = formatter.format(newDate).replace(/\//g, '/');

document.addEventListener("DOMContentLoaded", (event) => {
	document.getElementById('date').innerText = `Date. ${formattedDate}`;
});

