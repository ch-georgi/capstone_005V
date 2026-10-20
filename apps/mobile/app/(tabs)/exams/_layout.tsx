import {Stack} from "expo-router";
import {useTheme} from "../../../src/theme";
export default function ExamsLayout(){const {colors}=useTheme();return <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background}}}/>;}
