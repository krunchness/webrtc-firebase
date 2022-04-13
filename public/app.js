mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

// Default configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
        urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
    {
      urls: 'turn:numb.viagenie.ca',
      username: 'mark@ycse.kr',
      credential: 'V@llecera123'
    }
  ],
  iceCandidatePoolSize: 10,
};

const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 1,
};

var timer;
var countdown;
var i = 0;
let state = null;
let status = null;
let localshare = null;
const localName = 'callerCandidates';
const remoteName = 'calleeCandidates';
let peerConnection = null;
let pc = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;
let disc = null;
let stopscreen = null;
let room = null;
var sstate = null;

init();

async function init() {
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#startButton').addEventListener('click', startshare);
  window.onload = searchForRooms;
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
  disc = new mdc.dialog.MDCDialog(document.querySelector('#disconnect'));
  room = new mdc.dialog.MDCDialog(document.querySelector('#roomnotice'));
  stopscreen = new mdc.dialog.MDCDialog(document.querySelector('#stopscreen'));
  startButton.disabled = true;
}

async function searchForRooms(){
  const db = firebase.firestore();
  const snapshot = await db.collection('rooms').get();
  if(snapshot.empty){
    openUserMedia();
  }
  else{
    snapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data().state.state);
      if( doc.data().state.state == 'have-local-offer'){
        status = "join";
        openUserMedia(doc.id);
        id = doc.id;
      }
    });
    if (!status){
      openUserMedia();
    }
  }
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true})
  .then(stream => {
    localStream = stream;
    remoteStream = new MediaStream();
    console.log('Stream:', document.querySelector('#localVideo').srcObject);
    document.querySelector('#hangupBtn').disabled = false;

    if(status == "join"){
      joinRoom(e);
    }
    else{
      createRoom();
    }              
  }).catch(err => {
    if(err.message.includes("Requested device not found")){
      alert("Mic and/or camera not detected, please check your devices.")
      console.log(err.name);
    } 
    else {
      alert(`${err.message}, please close other apps that may be using your camera`)
      console.log(err.message)
    }
  });
}

async function createRoom() {
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();
  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);
  sstate = 'caller';
  registerPeerConnectionListeners();
  startButton.disabled = false;
  document.querySelector('#localVideo').srcObject = localStream;
  document.querySelector('#remoteVideo').srcObject = remoteStream;


  await localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  const offer = await peerConnection.createOffer(offerOptions);
  await peerConnection.setLocalDescription(offer);
  peerConnection.addEventListener('icecandidate', event => {
    const candidatesCollection = roomRef.collection(localName);
        if (event.candidate) {
          const json = event.candidate.toJSON();
          candidatesCollection.add(json);
        }

    roomRef.collection(localName).onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => { 
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          peerConnection.addIceCandidate(candidate)
          .catch(e=> {console.log("error:"+e.message)});
        }
      });
    });    
  })

  console.log('Created offer:', offer);
  let ctime = new Date().toLocaleString();
  const roomWithOffer = {
    'offer': {
      type: offer.type,
      sdp: offer.sdp,
    },
    'state': {
      state: state
    },
    'starttime': {
      time: ctime
    }
  }

  await roomRef.set(roomWithOffer);
  roomId = roomRef.id;
  roomtimeout(roomId);

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data && data.answer) {
      console.log('Got remote description: ', data.answer);
      const rtcSessionDescription = new RTCSessionDescription(data.answer);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
    }
  });

  roomRef.collection(remoteName).onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => { 
    if (change.type === "added") {
      console.log('added', change.doc.data());
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    });
  }); 

  room.open();

  roomRef.onSnapshot(async snapshot => {
    if (snapshot.data().sharestate.sharestate == "callee") {
      roomRef.update({sharestate: "connected"});
      shareanswer(roomId);
    }
  }); 
}

function joinRoom(roomId) {
  document.querySelector('#confirmJoinBtn').addEventListener('click', async () => {
    await joinRoomById(roomId);
  }, {once: true});

  document.querySelector('#cancelb').addEventListener('click', async () => {
    close();
  }, {once: true});  

  roomDialog.open();
}

async function joinRoomById(roomID) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomID}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);
  roomId = roomID;
  sstate = 'callee';
  startButton.disabled = false;
  document.querySelector('#remoteVideo').srcObject = localStream;
  document.querySelector('#localVideo').srcObject = remoteStream;

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    jointimeout(roomID);

    localStream.getTracks().forEach(track => {
      let a = peerConnection.addTrack(track, localStream);
      peerConnection.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          remoteStream.addTrack(track);
        });
      });
    });

    peerConnection.addEventListener('icecandidate', event => {
      const candidatesCollection = roomRef.collection(remoteName);

      if (event.candidate) {
        const json = event.candidate.toJSON();
        candidatesCollection.add(json);
      }

      roomRef.collection(remoteName).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => { 
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            peerConnection.addIceCandidate(candidate);
          }
        });
      });
    })

    roomRef.collection(localName).onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => { 
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          peerConnection.addIceCandidate(candidate);
        }
      });
    });

    peerConnection.addEventListener('connectionstatechange', event => {
      if (peerConnection.connectionState == "connected"){
        roomRef.update({state: "connected"});
        clearTimeout(timer);
       }
    }); 
           
    const offer = roomSnapshot.data().offer;
    console.log('Got offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);
    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    };
    await roomRef.update(roomWithAnswer);
  }
  else{
    alert("Room ID doesn't exists, please try again.");
  }

  roomRef.onSnapshot(async snapshot => {
    if (snapshot.data().sharestate.sharestate == "caller") {
      roomRef.update({sharestate: "connected"});
      shareanswer(roomId);
    }
  }); 
}

async function startshare(){
  let stream = navigator.mediaDevices.getDisplayMedia({video: true})
  .then(stream => {
    startButton.disabled = true;  
    document.querySelector('#localVideo').srcObject = stream;
    localshare = stream
    stream.getTracks().forEach(track => {
      localshare.addTrack(track);
    });
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      stopshare();
   });

    shareoffer();

  })
  .catch(err => {
    console.log(err.message);
  });

  if ((navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices)) {
    startButton.disabled = false;

  } else {
    alert('getDisplayMedia is not supported');
  }
  console.log(`check for roomid: ${roomId}`);
}

async function shareoffer() {
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc(`${roomId}`);
  console.log('Create pc with configuration: ', configuration);
  pc = new RTCPeerConnection(configuration);
  startButton.disabled = true;
  registerpcListeners();
  await localshare.getTracks().forEach(track => {
    pc.addTrack(track, localshare);
  });

  // Add code for creating a room here
  const offer = await pc.createOffer(offerOptions);
  await pc.setLocalDescription(offer);
  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data && data.shareanswer) {
      console.log('Got remote description: ', data.shareanswer);
      const rtcSessionDescription = new RTCSessionDescription(data.shareanswer);
      await pc.setRemoteDescription(rtcSessionDescription);
    }
  });
  pc.addEventListener('icecandidate', event => {
    const candidatesCollection = roomRef.collection('caller');
    if (event.candidate) {
      const json = event.candidate.toJSON();
      candidatesCollection.add(json);
    }

    roomRef.collection('caller').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => { 
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate)
          .catch(e=> {console.log("error:"+e.message)});
        }
      });
    });    
  })

  console.log('Created offer:', offer);
  const roomWithOffer = {
    'shareoffer': {
      type: offer.type,
      sdp: offer.sdp,
    },

    'sharestate': {
      sharestate: sstate
    }
  }

  await roomRef.update(roomWithOffer);
 
  
  // Listening for remote session description above

  // Listen for remote ICE candidates below
  roomRef.collection('callee').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => { 
      if (change.type === "added") {
        console.log('added', change.doc.data());
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  }); 
  roomId = roomRef.id;
}

async function shareanswer(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);
  localshare = new MediaStream();

  console.log('Create pc with configuration: ', configuration);
  pc = new RTCPeerConnection(configuration);
  registerpcListeners();

  pc.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteshare:', track);
      localshare.addTrack(track);
    });
  });
  document.querySelector('#localVideo').srcObject = localshare;

  pc.addEventListener('icecandidate', event => {
    const candidatesCollection = roomRef.collection('callee');
    if (event.candidate) {
      const json = event.candidate.toJSON();
      candidatesCollection.add(json);
    }

    roomRef.collection('callee').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => { 
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });          
  })      

  roomRef.collection('caller').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => { 
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });                                                    

  const offer = roomSnapshot.data().shareoffer;
  console.log('Got offer:', offer);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  console.log('Created answer:', answer);
  await pc.setLocalDescription(answer);

  const roomWithAnswer = {
    shareanswer: {
      type: answer.type,
      sdp: answer.sdp,
    },
  };
  await roomRef.update(roomWithAnswer);        

  document.getElementById('localVideo').addEventListener('ended',myHandler,false);
  function myHandler(e) {
    document.querySelector('#localVideo').style.display = "none";
  }

  roomRef.onSnapshot(async snapshot => {
    const data = snapshot.data();
    if (!data.sharestate && !data.shareoffer && !data.shareanswer) {
      document.querySelector('#localVideo').srcObject = remoteStream;
      startButton.disabled = false;

    }
    else{
      document.querySelector('#localVideo').style.display = "block";
      startButton.disabled = true;

    } 
  });
}

async function hangUp(e) {
  if(localshare){
    localshare.getTracks().forEach(track => track.stop());
    localshare = null;
  }
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (pc){
    pc.close();
  }

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#hangupBtn').disabled = true;
  startButton.disabled = true;

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);

    const calleeCandidates = await roomRef.collection('calleeCandidates').get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });

    const callerCandidates = await roomRef.collection('callerCandidates').get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });

    await roomRef.delete();
  }
}

async function stopshare(e) {
  console.log('The user has ended sharing the screen');
  startButton.disabled = false;
  document.querySelector('#localVideo').srcObject = localStream;

  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(roomId);

  const calleeCandidates = await roomRef.collection('callee').get();
  calleeCandidates.forEach(async candidate => {
    await candidate.ref.delete();
  });

  const callerCandidates = await roomRef.collection('caller').get();
  callerCandidates.forEach(async candidate => {
    await candidate.ref.delete();
  });

  const upd = {
    shareanswer: null,
    shareoffer: null,
    sharestate: null,
  };
  await roomRef.update(upd);
}

async function roomtimeout(e){
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${e}`);
  const roomSnapshot = await roomRef.get();
  countdown = 60
  timer = setTimeout(function(){  alert("Room expired");
                                  roomRef.update({state: "expired"});
                                  hangUp();
                                }, 60000);
  peerConnection.addEventListener('connectionstatechange', event => {
    if (peerConnection.connectionState == "connected"){
      clearTimeout(timer);
      clearInterval(x);
    }
  });

  var x = setInterval(function() {
    countdown--;
    if (countdown < 0) {
      clearInterval(x);
    }
  }, 1000);

  document.querySelector('#hangupBtn').addEventListener('click', ()=>{
    clearTimeout(timer);
    clearInterval(x);
    document.getElementById("currentRoom").innerHTML = "";
  });
}

async function jointimeout(e){
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${e}`);
  const roomSnapshot = await roomRef.get();
  countdown = 10;
  timer = setTimeout(function(){  alert("Room expired");
                                  roomRef.update({state: "expired"});
                                  hangUp()
                                }, 10000);

  var x = setInterval(function() {
    countdown--;
    if (countdown < 0) {
      clearInterval(x);
    }
  }, 1000);

  peerConnection.addEventListener('connectionstatechange', event => {
    if (peerConnection.connectionState == "connected"){
      clearTimeout(timer);
      clearInterval(x);
    }
  });

  document.querySelector('#hangupBtn').addEventListener('click', ()=>{
    clearTimeout(timer);
    clearInterval(x);
  });
}

function registerpcListeners(){
  pc.addEventListener('icegatheringstatechange', () => {
    console.log(`ICE gathering state changed: ${pc.iceGatheringState}`);
  });

  pc.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${pc.connectionState}`);
    if(pc.connectionState == "disconnected"){
      stopscreen.open();
      stopshare();
    }
  });

  pc.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${pc.signalingState}`);
    state = pc.signalingState;
  });

  pc.addEventListener('iceconnectionstatechange ', () => {
    console.log(`ICE connection state change: ${pc.iceConnectionState}`);
  });
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(`ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    if(peerConnection.connectionState == "disconnected"){
      remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection.connectionState == "disconnected"){
      disc.open();
      hangUp();
    }
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
    state = peerConnection.signalingState;
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(`ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}