import Sockette from 'sockette';

function handleChange(file) {
  const ext = file.split('.').pop();

  if (['js', 'beard'].includes(ext)) {
    // reload on frontend js, handles, and template changes
    location.reload();
  }

  const link = document.querySelector(`link[rel="stylesheet"][href*="${file}"]`);

  if (link) {
    const href = link.href;
    link.href = href;
  }
}

const socket = new Sockette('ws://127.0.0.1:PORT', {
  onmessage: (e) => {
    JSON.parse(e.data).forEach(handleChange);
  }
});
