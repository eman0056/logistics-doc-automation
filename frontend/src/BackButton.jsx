import React from 'react';

export const BackButton = ({ href = '/dashboard' }) => (
  <a href={href} className="emir-tb-btn back-button">← Back</a>
);
