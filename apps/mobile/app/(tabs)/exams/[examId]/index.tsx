import {SyncNotice} from "../../../../src/clinical/SyncNotice";
import {OfflineButton} from "../../../../src/clinical/OfflineButton";

import React from "react";

import {useAuth} from "../../../../src/auth/context";

import {router,useLocalSearchParams} from "expo-router";

import {ActivityIndicator,Platform} from "react-native";

import {useResource} from "../../../../src/exams/use-resource";

import {ExamDetail,dateLabel,sizeLabel} from "../../../../src/exams/types";

import {Screen,Heading,Copy,Card,Badge,Button,ErrorMessage} from "../../../../src/ui";

export default function Detail(){const {profile}=useAuth();const {examId}=useLocalSearchParams<{examId:string}>();const {data,loading,error,reload}=useResource<ExamDetail>(`/exams/${examId}`);return <Screen center={false}><Button title="Volver a mis exámenes" secondary onPress={()=>router.replace("/exams")}/><Heading>Detalle del examen</Heading><SyncNotice/>{Platform.OS==="android"&&profile?.access==="READ_WRITE"&&data?<Button title="Subir nueva versión" onPress={()=>router.push({pathname:"/upload",params:{examId:data.id}})}/>:null}{loading?<ActivityIndicator accessibilityLabel="Cargando detalle"/>:null}<ErrorMessage message={error}/>{error?<Button title="Reintentar" onPress={reload}/>:null}{data?<><Card><Badge>{data.examType.name}</Badge><Copy>{data.title}</Copy><Copy>Fecha: {dateLabel(data.examDate)}</Copy><Copy muted>Profesional: {data.professionalName||"No informado"}</Copy><Copy muted>{data.notes||"Sin notas adicionales"}</Copy></Card>{data.latestVersion?<Card><Copy>Ultima version conocida del servidor: {data.latestVersion.versionNumber}</Copy>{Platform.OS==="android"?<OfflineButton examId={data.id} version={data.latestVersion}/>:null}<Copy muted>{data.latestVersion.originalFilename} · {sizeLabel(data.latestVersion.sizeBytes)}</Copy><Button title="Ver documento" onPress={()=>router.push(`/document/${data.id}/${data.latestVersion!.id}`)}/><Button title="Descargar" secondary onPress={()=>router.push({pathname:"/document/[examId]/[versionId]",params:{examId:data.id,versionId:data.latestVersion!.id,download:"true"}})}/></Card>:<Copy>No hay una versión disponible.</Copy>}<Button title={`Historial de versiones (${data.versionCount})`} secondary onPress={()=>router.push(`/exams/${data.id}/versions`)}/></>:null}</Screen>;}
