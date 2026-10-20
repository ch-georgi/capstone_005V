import React, { useMemo } from "react";
import { WebView } from "react-native-webview";
import { pdfHtml } from "./html";
export default function PdfView({base64,onError,onReady}:{base64:string;onError:()=>void;onReady?:()=>void}){
 const html=useMemo(()=>pdfHtml(base64),[base64]);
 return <WebView accessibilityLabel="Visor PDF" source={{html}} originWhitelist={["about:blank"]} javaScriptEnabled allowFileAccess={false} mixedContentMode="never" setSupportMultipleWindows={false} onShouldStartLoadWithRequest={r=>r.url==="about:blank"} onError={onError} onRenderProcessGone={onError} onContentProcessDidTerminate={onError} onMessage={e=>{try{const data=JSON.parse(e.nativeEvent.data);if(data.error)onError();else if(data.ready)onReady?.();}catch{onError();}}} style={{flex:1,backgroundColor:"#E5E7EB"}} />;
}
