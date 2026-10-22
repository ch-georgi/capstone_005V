import React from "react";
import {fireEvent,render,screen} from "@testing-library/react-native";
import {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import {DateField} from "../src/components/DateField.android";
import {clinicalDate} from "../src/components/date-value";
jest.mock("@react-native-community/datetimepicker",()=>({DateTimePickerAndroid:{open:jest.fn()}}));
it("opens a native calendar with the existing clinical date and updates only on confirmation",async()=>{
  const change=jest.fn();await render(<DateField label="Fecha del examen" value="2026-10-22" onChangeText={change}/>);
  await fireEvent.press(screen.getByText("22/10/2026"));
  const options=(DateTimePickerAndroid.open as jest.Mock).mock.calls[0][0];
  expect(options.mode).toBe("date");expect(options.display).toBe("calendar");
  expect(clinicalDate(options.value)).toBe("2026-10-22");expect(change).not.toHaveBeenCalled();
  const date=new Date(2026,0,2,23,30);date.toISOString=()=>{throw new Error("Clinical dates must not be shifted to UTC");};
  options.onValueChange({},date);expect(change).toHaveBeenCalledWith("2026-01-02");
});
it("disables the calendar while submitting",async()=>{
  (DateTimePickerAndroid.open as jest.Mock).mockClear();await render(<DateField label="Fecha" value="" onChangeText={jest.fn()} disabled/>);
  await fireEvent.press(screen.getByText("Seleccionar fecha"));expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
});
