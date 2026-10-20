export interface ExamType { id:string; code:string; name:string }
export interface ExamVersion { id:string; versionNumber:number; originalFilename:string; mimeType:string; sizeBytes:number; sha256:string; createdAt:string; uploadedBy:{id:string;displayName:string|null} }
export interface Exam { id:string;patientId:string;title:string;examDate:string;professionalName:string|null;notes:string|null;examType:ExamType;versionCount:number;latestVersion:ExamVersion|null;createdAt:string;updatedAt:string }
export interface ExamDetail extends Exam { versions:ExamVersion[];createdBy:{id:string;displayName:string|null} }
export interface ExamPage {items:Exam[];total:number;limit:number;offset:number}
export const dateLabel=(value:string)=>{const date=value.slice(0,10).split("-");return date.length===3?`${date[2]}/${date[1]}/${date[0]}`:value;};
export const sizeLabel=(size:number)=>size<1024?`${size} B`:`${(size/1024).toFixed(1)} KB`;
export function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
