// @ts-expect-error Bun supplies this test-only module at runtime; app dependencies omit Bun's types.
import { test, expect, mock } from 'bun:test';
const saved = new Map<string,string>();
mock.module('@react-native-async-storage/async-storage', () => ({default:{getItem:async(k:string)=>saved.get(k)??null,setItem:async(k:string,v:string)=>{saved.set(k,v);},removeItem:async(k:string)=>{saved.delete(k);}}}));
mock.module('react-native', () => ({Appearance:{getColorScheme:()=> 'light'}}));
const { useThemeStore } = await import('../store/themeStore');
test('Rork theme choice survives duplicate events, system changes and rehydration',async()=>{
 await useThemeStore.persist.rehydrate();
 useThemeStore.setState({userSelected:false});
 useThemeStore.getState().applySystemTheme('dark');
 expect(useThemeStore.getState().theme).toBe('dark');
 useThemeStore.getState().setTheme('light');
 useThemeStore.getState().setTheme('light');
 useThemeStore.getState().applySystemTheme('dark');
 expect(useThemeStore.getState().theme).toBe('light');
 expect(useThemeStore.getState().userSelected).toBe(true);
 expect(useThemeStore.getState().colors.background).toBe('#FFFFFF');
 await useThemeStore.persist.rehydrate();
 expect(useThemeStore.getState().theme).toBe('light');
 expect(useThemeStore.getState().userSelected).toBe(true);
 const persisted=JSON.parse(saved.get('theme-storage')!);
 expect(persisted.state).toEqual({theme:'light',userSelected:true});
});
