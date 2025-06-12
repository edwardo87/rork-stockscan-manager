import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export default function QuantityInput({ 
  value, 
  onChange, 
  min = 0, 
  max = 9999,
  label = 'Quantity'
}: QuantityInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  const { colors } = useThemeStore();

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleInputChange = (text: string) => {
    // Allow only numbers
    if (/^\d*$/.test(text)) {
      setInputValue(text);
      
      const numValue = text === '' ? 0 : parseInt(text, 10);
      if (!isNaN(numValue)) {
        // Ensure value is within min/max range
        const boundedValue = Math.min(Math.max(numValue, min), max);
        onChange(boundedValue);
      }
    }
  };

  const increment = () => {
    if (value < max) {
      const newValue = value + 1;
      onChange(newValue);
      setInputValue(newValue.toString());
    }
  };

  const decrement = () => {
    if (value > min) {
      const newValue = value - 1;
      onChange(newValue);
      setInputValue(newValue.toString());
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: colors.text }]}>{label}</Text>}
      <View style={[styles.inputContainer, { borderColor: colors.border }]}>
        <TouchableOpacity 
          style={[
            styles.button, 
            { backgroundColor: colors.lightGray },
            value <= min && { opacity: 0.5 }
          ]} 
          onPress={decrement}
          disabled={value <= min}
        >
          <Minus size={20} color={value <= min ? colors.inactive : colors.text} />
        </TouchableOpacity>
        
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={inputValue}
          onChangeText={handleInputChange}
          keyboardType="numeric"
          selectTextOnFocus
        />
        
        <TouchableOpacity 
          style={[
            styles.button, 
            { backgroundColor: colors.lightGray },
            value >= max && { opacity: 0.5 }
          ]} 
          onPress={increment}
          disabled={value >= max}
        >
          <Plus size={20} color={value >= max ? colors.inactive : colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  button: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '500',
  },
});