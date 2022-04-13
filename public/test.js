document.querySelector('#startButton').addEventListener('click', startshare);
function startshare(){
    let stream = navigator.mediaDevices.getDisplayMedia({video: true})
        .then(stream => {
          startButton.disabled = true;
          const video = document.getElementById('localVideo');
          video.srcObject = stream;

          // demonstrates how to detect that the user has stopped
          // sharing the screen via the browser UI.
          stream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('The user has ended sharing the screen');
            startButton.disabled = false;
         });
        })
        .catch(err => {
                  console.log(err.message);
            });

  if ((navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices)) {
    startButton.disabled = false;
  } else {
    errorMsg('getDisplayMedia is not supported');
  }
}