import Sockette from 'sockette';

function handleChange(file) {
  const parts = file.split('.');
  const name = parts[0];
  const ext = parts[2];

  if (['js', 'beard'].includes(ext)) {
    // reload on frontend js, handles, and template changes
    location.reload();
  }

  const link = document.querySelector(`link[rel="stylesheet"][href*="${name}"]`);

  if (link) {
    const href = link.href.replace(link.href.split('/').pop(), file);
    link.href = href;
  }
}

const socket = new Sockette('ws://127.0.0.1:PORT', {
  onmessage: (e) => {
    JSON.parse(e.data).forEach(handleChange);
  }
});
