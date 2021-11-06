const sock = new WebSocket('ws://127.0.0.1:7778');


function handleChange(path) {
  const ext = path.split('.').pop();
  const file  = path.split('/').pop();

  console.log({ path });
  console.log({ file });
  console.log({ ext });

  if (ext === 'css') {
    const link = document.querySelector(`link[rel="stylesheet"][href*="${file}"]`);
    console.log({ link });

    if (link) {
      const href = link.href;
      link.href = href;
    }
  // } else if ('js' === ext) {
  } else if (['js', 'beard'].includes(ext)) {
    // this should hard refresh js files and ssjs.js handles
    // it doesn't work right now because chokidar is firing
    // change on handles that aren't changing
    location.reload();
  }
}


sock.onmessage = function(e) {
  console.log(JSON.parse(e.data));
  JSON.parse(e.data).forEach(handleChange);
}

// sock.onmessage = function(e) {
//   const ext = e.data.split('.').pop();
//   const file  = e.data.split('/').pop();

//   console.log({ data: e.data });
//   console.log({ file });
//   console.log({ ext });

//   if (ext === 'css') {
//     const link = document.querySelector(`link[rel="stylesheet"][href*="${file}"]`);
//     console.log({ link });

//     if (link) {
//       const href = link.href;
//       link.href = href;
//     }
//   // } else if ('js' === ext) {
//   } else if (['js', 'beard'].includes(ext)) {
//     // this should hard refresh js files and ssjs.js handles
//     // it doesn't work right now because chokidar is firing
//     // change on handles that aren't changing
//     location.reload();
//   }
// }
