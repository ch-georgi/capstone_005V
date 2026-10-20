import React,{useEffect,useState,useRef} from "react";
import {ActivityIndicator,AppState,Image,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {router,useLocalSearchParams} from "expo-router";
import {useAuth} from "../../../src/auth/context";
import {useTheme} from "../../../src/theme";
import {ExamDetail,ExamVersion} from "../../../src/exams/types";
import {temporaryDocument,exportDocument} from "../../../src/documents/files";
import PdfView from "../../../src/documents/PdfView";
import {Button,Copy,ErrorMessage} from "../../../src/ui";
function Document(){
 const {examId,versionId,download}=useLocalSearchParams<{examId:string;versionId:string;download?:string}>();const {manager}=useAuth();const {colors}=useTheme();
 const savingRef=useRef(false);
 const [revision,setRevision]=useState(0),[error,setError]=useState(""),[loading,setLoading]=useState(true),[file,setFile]=useState<{uri:string;base64:string;version:ExamVersion}|null>(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{let active=true;let remove:(()=>void)|undefined;
 async function load(){try{const detail=await manager.request<ExamDetail>(`/exams/${examId}`);const version=detail.versions.find(v=>v.id===versionId);if(!version)throw new Error("La versión no está disponible.");const result=await manager.file(`/exams/${examId}/versions/${versionId}/view`);if(!active)return;const temp=await temporaryDocument(result.bytes,result.mimeType,version);remove=temp.remove;const base64=result.mimeType==="application/pdf"?await temp.base64():"";if(!active){remove();return;}setFile({uri:temp.uri,base64,version});setLoading(false);}catch(e){if(active){setLoading(false);setError(e instanceof Error?e.message:"No se pudo recuperar el documento.");}}}
 void load();const subscription=AppState.addEventListener("change",state=>{if(state!=="active"&&!savingRef.current){active=false;remove?.();setFile(null);router.back();}});
 return ()=>{active=false;remove?.();subscription.remove();};
 },[manager,examId,versionId,revision]);
 async function save(){if(!file)return;savingRef.current=true;setSaving(true);setError("");setNotice("");try{const result=await manager.file(`/exams/${examId}/versions/${versionId}/download`);const saved=await exportDocument(result.bytes,result.mimeType,file.version);if(saved)setNotice("Copia guardada en la ubicación elegida.");}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el archivo.");}finally{savingRef.current=false;setSaving(false);}}
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><View style={{padding:16,gap:8}}><Button title="Volver" secondary onPress={()=>router.canGoBack()?router.back():router.replace("/exams")}/><Copy>{file?.version.originalFilename??"Documento"}</Copy><ErrorMessage message={error}/>{notice?<Copy>{notice}</Copy>:null}{error?<Button title="Reintentar" onPress={()=>{setLoading(true);setError("");setFile(null);setRevision(v=>v+1);}}/>:null}{file?<Button title={download==="true"?"Elegir ubicación para guardar":"Descargar documento"} busy={saving} onPress={()=>void save()}/>:null}</View>{loading?<ActivityIndicator accessibilityLabel="Cargando documento"/>:null}{file?.version.mimeType==="application/pdf"?<PdfView base64={file.base64} onError={()=>{setError("No se pudo abrir este PDF. Puede estar dañado o protegido.");setFile(null);}}/>:file?<Image source={{uri:file.uri}} accessibilityLabel="Documento de imagen" resizeMode="contain" style={{flex:1}} onError={()=>{setError("La imagen no se pudo visualizar.");setFile(null);}}/>:null}</SafeAreaView>;
}

export default function DocumentRoute(){const {examId,versionId}=useLocalSearchParams<{examId:string;versionId:string}>();return <Document key={`${examId}:${versionId}`}/>;}
