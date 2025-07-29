declare module 'expo-barcode-generator' {
  import { ComponentType } from 'react';

  export interface BarCodeCreatorProps {
    value: string;
    format: 'QR' | 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC';
    width?: number;
    height?: number;
    background?: string;
    color?: string;
  }

  export const BarCodeCreator: ComponentType<BarCodeCreatorProps>;
}