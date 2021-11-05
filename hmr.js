const socket = new WebSocket('ws://127.0.0.1:7778');


function handleChange(file) {
  const ext = file.split('.').pop();

  console.log({ file });

  if (ext === 'css') {
    const link = document.querySelector(`link[rel="stylesheet"][href*="${file}"]`);

    if (link) {
      const href = link.href;
      link.href = href;
    }
  } else if (['js', 'beard'].includes(ext)) {
    // reload on frontend js, handles, and template changes
    location.reload();
  }
}


socket.onmessage = (e) => {
  JSON.parse(e.data).forEach(handleChange);
}
