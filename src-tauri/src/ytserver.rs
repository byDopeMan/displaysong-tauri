// ============================================================================
// LOCAL YOUTUBE PLAYER SERVER
// ============================================================================
// Serves a tiny page that hosts the YouTube IFrame player from a real
// http://127.0.0.1 origin. The Tauri webview's custom-protocol origin
// (https://tauri.localhost) is rejected by YouTube's embed checks (error 150
// for essentially every video), but a normal localhost http origin is accepted.
//
// The page is loaded by the frontend in a hidden iframe and controlled via
// window.postMessage (play / pause / resume / stop / volume), reporting back
// player events (ready / state / playing / ended / error).

use log::{error, info};

const PLAYER_HTML: &str = r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>YT</title></head>
<body style="margin:0;background:#000;overflow:hidden">
<div id="p"></div>
<script>
  var player=null, ready=false, pending=null, vol=50, announced=null;
  function send(msg){ try{ msg.source='yt'; parent.postMessage(msg,'*'); }catch(e){} }
  window.onYouTubeIframeAPIReady=function(){
    player=new YT.Player('p',{height:'180',width:'320',
      playerVars:{autoplay:1,controls:0,disablekb:1,modestbranding:1,rel:0,fs:0,playsinline:1},
      events:{
        onReady:function(){ ready=true; try{player.setVolume(vol);}catch(e){} send({type:'ready'}); if(pending){var v=pending;pending=null;load(v);} },
        onStateChange:function(e){
          send({type:'state',state:e.data});
          if(e.data===1){ try{player.setVolume(vol);}catch(e){} var id=cur(); if(id&&announced!==id){ announced=id; var d=0; try{d=Math.round((player.getDuration()||0)*1000);}catch(e){} send({type:'playing',durationMs:d}); } }
          else if(e.data===0){ send({type:'ended'}); }
        },
        onError:function(e){ send({type:'error',code:e.data}); }
      }});
  };
  function cur(){ try{return player.getVideoData().video_id;}catch(e){return null;} }
  function load(v){ announced=null; if(player&&ready){ try{player.loadVideoById(v);}catch(e){} } else { pending=v; } }
  window.addEventListener('message',function(ev){
    var d=ev.data||{}; if(d.target!=='yt')return;
    if(d.type==='play'){ if(typeof d.volume==='number'){vol=d.volume;} if(player&&ready){try{player.setVolume(vol);}catch(e){}} load(d.videoId); }
    else if(d.type==='pause'){ try{player.pauseVideo();}catch(e){} }
    else if(d.type==='resume'){ try{player.playVideo();}catch(e){} }
    else if(d.type==='stop'){ try{player.stopVideo();}catch(e){} }
    else if(d.type==='volume'){ vol=d.value; try{player.setVolume(vol);}catch(e){} }
  });
  var s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; document.head.appendChild(s);
</script>
</body>
</html>"#;

/// Start the local YouTube player server on 127.0.0.1:<port>. Runs for the app's
/// lifetime, serving the player page for any GET request.
pub fn start(port: u16) {
    tauri::async_runtime::spawn(async move {
        use tokio::net::TcpListener;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(l) => l,
            Err(e) => {
                error!("YouTube player server bind failed on 127.0.0.1:{}: {}", port, e);
                return;
            }
        };
        info!("YouTube player server listening on 127.0.0.1:{}", port);

        let body = PLAYER_HTML.as_bytes();
        loop {
            match listener.accept().await {
                Ok((mut socket, _)) => {
                    let mut buf = [0u8; 1024];
                    let _ = socket.read(&mut buf).await; // drain the request line/headers
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = socket.write_all(header.as_bytes()).await;
                    let _ = socket.write_all(body).await;
                    let _ = socket.flush().await;
                    let _ = socket.shutdown().await;
                }
                Err(e) => {
                    error!("YouTube player server accept error: {}", e);
                }
            }
        }
    });
}
