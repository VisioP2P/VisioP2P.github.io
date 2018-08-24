// on genere une room aleatoire si besoin
if (!location.hash) {
 location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

//API ID
const drone = new ScaleDrone('yiS12Ts5RdNhebyM');

// Le nom de la room doit être prefixé par 'observable' ce qui permet
// de garder la trace des users connectés et lier les messages
const roomName = 'observable-' + roomHash;

// Configuration de l'instance de RTCPeerConnection
// on utilise le serveur STUN public de Google
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};

let room;
let pc;

// Callbacks
function onSuccess() {};
function onError(error) {
  console.error(error);
};

// Si echec authentification API
drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  
  // Si echec de d'ouverture de la room
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  
  // On est connecté à la room et on recoit un array des membres connectés
  // Le serveur de signalement est prêt 
  room.on('members', members => {
    console.log('MEMBERS', members);
    
    // Si on est le deusième utilisateur à se connecter à la room 
    // on génère une offre
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// On envoie les données de signalement via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

// On instancie RTCPeerConnection avec la configuration serveur
function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' nous notifie quand un agent ICE doit délivrer
  //  un message aux autres peers par le serveur de signalement
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };

  // Si l'useur est l'offrant l'évenement 'negotiationneeded' créer l'offre
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // Quand un flux video a distance arrive on l'envoi dans la 'remoteVideo'
  pc.ontrack = event => {
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  // On récupère le flux audio et vidéo local
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    // Et on l'affiche dans l'élément 'localVideo'
    localVideo.srcObject = stream;
    // On ajoute le flux local a envoyer aux autres peers
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }, onError);

  // On écoute les données de signalement de Scaledrone
  room.on('data', (message, client) => {
    if (client.id === drone.clientId) {
      return;
    }

	// Session description Protocol appelé  
	// quand on recoit une offre ou une réponse d'un autre peer
    if (message.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // Si on recoit une offre on lui répond
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // On ajoute le nouveau candidat ICE à notre description de co à distance
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}

// Appelé quand on créer ou réponds à une offre
// met à jour la description de la co locale
function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}