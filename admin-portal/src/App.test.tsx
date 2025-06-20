import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders BahinLink title', () => {
  render(<App />);
  const titleElement = screen.getByText(/BahinLink/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders Security Workforce Management subtitle', () => {
  render(<App />);
  const subtitleElement = screen.getByText(/Security Workforce Management/i);
  expect(subtitleElement).toBeInTheDocument();
});

test('renders loading message', () => {
  render(<App />);
  const loadingElement = screen.getByText(/Admin Portal is loading/i);
  expect(loadingElement).toBeInTheDocument();
});
