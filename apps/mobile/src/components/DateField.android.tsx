import React from "react";
import {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import {Button,Copy} from "../ui";
import {dateLabel} from "../exams/types";
import {clinicalDate,pickerDate,DateFieldProps} from "./date-value";
export function DateField({label,value,onChangeText,disabled}:DateFieldProps){
  function open(){
    DateTimePickerAndroid.open({
      value:pickerDate(value),mode:"date",display:"calendar",
      positiveButton:{label:"Aceptar"},negativeButton:{label:"Cancelar"},
      onValueChange:(_event,date)=>onChangeText(clinicalDate(date)),
    });
  }
  return <><Copy>{label}</Copy><Button title={value?dateLabel(value):"Seleccionar fecha"} secondary disabled={disabled} onPress={open}/></>;
}
