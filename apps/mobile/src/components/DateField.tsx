import React from "react";
import {Field} from "../ui";
import {DateFieldProps} from "./date-value";
export function DateField({disabled,...props}:DateFieldProps){return <Field {...props} editable={!disabled} placeholder="AAAA-MM-DD"/>;}
