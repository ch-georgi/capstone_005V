import {validDate} from "../exams/types";
export function pickerDate(value:string):Date {
  if(!validDate(value))return new Date();
  const [year,month,day]=value.split("-").map(Number);
  return new Date(year,month-1,day,12);
}
export function clinicalDate(value:Date):string {
  return `${value.getFullYear().toString().padStart(4,"0")}-${(value.getMonth()+1).toString().padStart(2,"0")}-${value.getDate().toString().padStart(2,"0")}`;
}
export interface DateFieldProps {label:string;value:string;onChangeText:(value:string)=>void;disabled?:boolean}
