import { forwardRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps } from 'react-native';
import { C } from './theme';

/** Text/TextInput con colores del tema (RN usa texto negro por defecto, invisible sobre OLED). */
export function Text({ style, ...p }: TextProps) {
  return <RNText {...p} style={[{ color: C.text }, style]} />;
}
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...p }, ref) {
  return <RNTextInput ref={ref} placeholderTextColor={C.mute} selectionColor={C.blue} keyboardAppearance="dark" {...p} style={[{ color: C.text }, style]} />;
});
