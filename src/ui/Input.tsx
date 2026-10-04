import { forwardRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { C } from './theme';

export const Input = forwardRef<TextInput, TextInputProps>(function Input({ style, ...props }, ref) {
  return <TextInput ref={ref} placeholderTextColor={C.mute} selectionColor={C.blue} keyboardAppearance="dark" {...props} style={[{ color: C.text, fontSize: 15 }, style]} />;
});
