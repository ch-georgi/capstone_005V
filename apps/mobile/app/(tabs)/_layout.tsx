import React from "react";
import {Tabs} from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {useTheme} from "../../src/theme";
export default function TabLayout(){const {colors}=useTheme();return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:colors.green,tabBarInactiveTintColor:colors.muted,tabBarStyle:{backgroundColor:colors.surface,borderTopColor:colors.border},tabBarLabelStyle:{fontFamily:"Poppins_500Medium",fontSize:11},tabBarHideOnKeyboard:true,sceneStyle:{backgroundColor:colors.background}}}>
 <Tabs.Screen name="index" options={{title:"Inicio",tabBarIcon:({color,size})=><Ionicons name="home-outline" color={color} size={size}/>}}/>
 <Tabs.Screen name="exams" options={{title:"Mis exámenes",tabBarIcon:({color,size})=><Ionicons name="document-text-outline" color={color} size={size}/>}}/>
 <Tabs.Screen name="account" options={{title:"Mi cuenta",tabBarIcon:({color,size})=><Ionicons name="person-circle-outline" color={color} size={size}/>}}/>
 </Tabs>;}
