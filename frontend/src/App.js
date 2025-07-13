import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

// Configuration Panel Component
const ConfigPanel = ({ config, onConfigUpdate }) => {
  const [provider, setProvider] = useState(config?.provider || 'claude');
  const [model, setModel] = useState(config?.model || '');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dbStats, setDbStats] = useState(null);
  const [importFile, setImportFile] = useState(null);

  const providerOptions = [
    { value: 'claude', label: 'Claude (Anthropic)' },
    { value: 'chatgpt', label: 'ChatGPT (OpenAI)' },
    { value: 'openrouter', label: 'OpenRouter' }
  ];

  useEffect(() => {
    if (provider) {
      fetchModels(provider);
    }
  }, [provider]);

  useEffect(() => {
    loadDbStats();
  }, []);

  useEffect(() => {
    // Refresh stats when config changes (triggered by data updates)
    if (config?._refresh) {
      loadDbStats();
    }
  }, [config]);

  const loadDbStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/database/stats`);
      const data = await response.json();
      setDbStats(data);
    } catch (error) {
      console.error('Error loading database stats:', error);
    }
  };

  const fetchModels = async (selectedProvider) => {
    try {
      console.log('Fetching models for provider:', selectedProvider);
      const response = await fetch(`${API_BASE_URL}/models/${selectedProvider}`);
      const data = await response.json();
      console.log('Received models:', data.models);
      setModels(data.models);
      if (data.models.length > 0 && !model) {
        setModel(data.models[0]);
        console.log('Set default model to:', data.models[0]);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const handleSave = async () => {
    if (!provider || !model || !apiKey) {
      alert('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        provider,
        model,
        api_key: apiKey
      };
      
      console.log('Sending config:', payload);
      
      const response = await fetch(`${API_BASE_URL}/config/llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onConfigUpdate({ provider, model, configured: true });
        setApiKey(''); // Clear API key from display
        alert('Configuration saved successfully!');
      } else {
        const errorData = await response.text();
        console.error('Server error:', errorData);
        alert(`Failed to save configuration: ${errorData}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Error saving configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleExportDatabase = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/database/export`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biographer_export_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to export database');
      }
    } catch (error) {
      console.error('Error exporting database:', error);
      alert('Error exporting database');
    }
  };

  const handleImportDatabase = async () => {
    if (!importFile) {
      alert('Please select a file to import');
      return;
    }

    if (!window.confirm('This will replace all your current interview data and biography. Are you sure?')) {
      return;
    }

    try {
      const fileText = await importFile.text();
      const importData = JSON.parse(fileText);

      const response = await fetch(`${API_BASE_URL}/database/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(importData),
      });

      if (response.ok) {
        alert('Database imported successfully!');
        setImportFile(null);
        loadDbStats();
        // Reset file input
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) fileInput.value = '';
      } else {
        alert('Failed to import database');
      }
    } catch (error) {
      console.error('Error importing database:', error);
      alert('Error importing database - please check the file format');
    }
  };

  const handleClearDatabase = async () => {
    const confirmed = window.confirm(
      'This will permanently delete ALL your interview data and biography. This cannot be undone. Are you absolutely sure?'
    );
    
    if (!confirmed) return;

    const doubleConfirmed = window.confirm(
      'Last chance: This will delete everything except your LLM configuration. Type YES in the next prompt to confirm.'
    );
    
    if (!doubleConfirmed) return;

    const finalConfirm = window.prompt('Type "YES" to confirm deletion:');
    if (finalConfirm !== 'YES') {
      alert('Database clear cancelled');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/database/clear`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Database cleared successfully');
        loadDbStats();
      } else {
        alert('Failed to clear database');
      }
    } catch (error) {
      console.error('Error clearing database:', error);
      alert('Error clearing database');
    }
  };

  return (
    <div className="config-panel">
      <h3>Configuration</h3>
      
      {/* LLM Configuration Section */}
      <div className="config-section">
        <h4>LLM Settings</h4>
        <div className="form-group">
          <label>Provider:</label>
          <select 
            value={provider} 
            onChange={(e) => setProvider(e.target.value)}
            className="select-input"
          >
            {providerOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Model:</label>
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)}
            className="select-input"
          >
            {models.map(modelName => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>API Key:</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="text-input"
          />
        </div>

        <button 
          onClick={handleSave} 
          disabled={loading}
          className="primary-button"
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {/* Database Management Section */}
      <div className="config-section">
        <h4>Database Management</h4>
        
        {dbStats && (
          <div className="db-stats">
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Questions:</span>
                <span className="stat-value">{dbStats.total_questions}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Answered:</span>
                <span className="stat-value">{dbStats.answered_questions}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Biography Words:</span>
                <span className="stat-value">{dbStats.biography_word_count.toLocaleString()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Database Size:</span>
                <span className="stat-value">{dbStats.database_size_mb} MB</span>
              </div>
            </div>
          </div>
        )}

        <div className="db-actions">
          <div className="action-group">
            <h5>Export Data</h5>
            <p>Download your interview data and biography as a JSON file</p>
            <button onClick={handleExportDatabase} className="secondary-button">
              Export Database
            </button>
          </div>

          <div className="action-group">
            <h5>Import Data</h5>
            <p>Upload a previously exported JSON file to restore your data</p>
            <input
              type="file"
              accept=".json"
              onChange={(e) => setImportFile(e.target.files[0])}
              className="file-input"
            />
            <button 
              onClick={handleImportDatabase}
              disabled={!importFile}
              className="secondary-button"
            >
              Import Database
            </button>
          </div>

          <div className="action-group danger">
            <h5>Clear All Data</h5>
            <p>⚠️ Permanently delete all interview data and biography (keeps LLM config)</p>
            <button 
              onClick={handleClearDatabase}
              className="danger-button"
            >
              Clear Database
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Biography Component
const Biography = ({ config }) => {
  const [biography, setBiography] = useState({
    outline: null,
    full_text: null,
    outline_updated: null,
    text_updated: null,
    word_count: 0
  });
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineText, setOutlineText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState('outline');

  useEffect(() => {
    loadBiography();
  }, []);

  const loadBiography = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/biography`);
      const data = await response.json();
      setBiography(data);
      setOutlineText(data.outline || '');
    } catch (error) {
      console.error('Error loading biography:', error);
    }
  };

  const generateOutline = async () => {
    if (!config?.configured) {
      alert('Please configure your LLM settings first.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/biography/outline/generate`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setBiography(prev => ({ ...prev, outline: data.outline }));
        setOutlineText(data.outline);
        setEditingOutline(false);
      } else {
        alert('Failed to generate outline');
      }
    } catch (error) {
      console.error('Error generating outline:', error);
      alert('Error generating outline');
    } finally {
      setLoading(false);
    }
  };

  const saveOutline = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/biography/outline`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ outline: outlineText }),
      });

      if (response.ok) {
        setBiography(prev => ({ ...prev, outline: outlineText }));
        setEditingOutline(false);
        await loadBiography(); // Refresh to get updated timestamp
      } else {
        alert('Failed to save outline');
      }
    } catch (error) {
      console.error('Error saving outline:', error);
      alert('Error saving outline');
    } finally {
      setLoading(false);
    }
  };

  const generateBiography = async () => {
    if (!config?.configured) {
      alert('Please configure your LLM settings first.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/biography/generate`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setBiography(prev => ({ 
          ...prev, 
          full_text: data.full_text,
          word_count: data.word_count 
        }));
        setActiveView('text');
        await loadBiography(); // Refresh to get updated timestamp
      } else {
        alert('Failed to generate biography');
      }
    } catch (error) {
      console.error('Error generating biography:', error);
      alert('Error generating biography');
    } finally {
      setLoading(false);
    }
  };

  if (!config?.configured) {
    return (
      <div className="biography-panel">
        <p className="info-message">Please configure your LLM settings first.</p>
      </div>
    );
  }

  return (
    <div className="biography-panel">
      <h3>Your Biography</h3>
      
      <div className="biography-nav">
        <button 
          className={`bio-nav-tab ${activeView === 'outline' ? 'active' : ''}`}
          onClick={() => setActiveView('outline')}
        >
          Outline
        </button>
        <button 
          className={`bio-nav-tab ${activeView === 'text' ? 'active' : ''}`}
          onClick={() => setActiveView('text')}
        >
          Full Biography {biography.word_count > 0 && `(${biography.word_count.toLocaleString()} words)`}
        </button>
      </div>

      {activeView === 'outline' && (
        <div className="outline-section">
          <div className="section-header">
            <h4>Biography Outline</h4>
            <div className="section-actions">
              {!editingOutline ? (
                <>
                  <button 
                    onClick={generateOutline}
                    disabled={loading}
                    className="primary-button small"
                  >
                    {loading ? 'Generating...' : biography.outline ? 'Regenerate Outline' : 'Generate Outline'}
                  </button>
                  {biography.outline && (
                    <button 
                      onClick={() => setEditingOutline(true)}
                      className="secondary-button small"
                    >
                      Edit
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button 
                    onClick={saveOutline}
                    disabled={loading}
                    className="primary-button small"
                  >
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button 
                    onClick={() => {
                      setEditingOutline(false);
                      setOutlineText(biography.outline || '');
                    }}
                    className="secondary-button small"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {biography.outline || editingOutline ? (
            <div className="outline-content">
              {editingOutline ? (
                <textarea
                  value={outlineText}
                  onChange={(e) => setOutlineText(e.target.value)}
                  className="outline-editor"
                  rows="20"
                  placeholder="Edit your biography outline..."
                />
              ) : (
                <div className="outline-display">
                  <pre>{biography.outline}</pre>
                </div>
              )}
              {biography.outline_updated && (
                <div className="last-updated">
                  Last updated: {new Date(biography.outline_updated).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div className="no-outline">
              <p>No outline generated yet. Click "Generate Outline" to create a comprehensive outline based on your interview responses.</p>
            </div>
          )}
        </div>
      )}

      {activeView === 'text' && (
        <div className="biography-section">
          <div className="section-header">
            <h4>Full Biography</h4>
            <div className="section-actions">
              <button 
                onClick={generateBiography}
                disabled={loading}
                className="primary-button"
              >
                {loading ? 'Generating...' : biography.full_text ? 'Regenerate Biography' : 'Generate Biography'}
              </button>
            </div>
          </div>

          {biography.full_text ? (
            <div className="biography-content">
              <div className="biography-stats">
                <span>Word count: {biography.word_count.toLocaleString()}</span>
                {biography.text_updated && (
                  <span>Last updated: {new Date(biography.text_updated).toLocaleString()}</span>
                )}
              </div>
              <div className="biography-text">
                <pre>{biography.full_text}</pre>
              </div>
            </div>
          ) : (
            <div className="no-biography">
              <p>No biography text generated yet.</p>
              <p>Generate an outline first, then click "Generate Biography" to create your full life story based on your interview responses.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Question Panel Component
const QuestionPanel = ({ currentQuestion, onAnswerSubmit, onNewQuestion, config }) => {
  const [answer, setAnswer] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAnswerSubmit = async () => {
    if (!answer.trim()) {
      alert('Please provide an answer');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          qa_id: currentQuestion.id,
          answer: answer.trim()
        }),
      });

      if (response.ok) {
        setAnswer('');
        onAnswerSubmit(); // This will refresh history and clear current question
        
        // Automatically generate next question
        setTimeout(() => {
          handleGenerateQuestion();
        }, 500);
      } else {
        alert('Failed to save answer');
      }
    } catch (error) {
      console.error('Error saving answer:', error);
      alert('Error saving answer');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestion = async (isCustom = false, isPrompted = false) => {
    setLoading(true);
    try {
      let requestBody = {};
      
      if (isCustom && customQuestion.trim()) {
        requestBody = { custom_question: customQuestion.trim() };
      } else if (isPrompted && questionPrompt.trim()) {
        requestBody = { question_prompt: questionPrompt.trim() };
      }

      const response = await fetch(`${API_BASE_URL}/question/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        onNewQuestion(data);
        setCustomQuestion('');
        setQuestionPrompt('');
        setShowCustomInput(false);
        setShowPromptInput(false);
      } else {
        alert('Failed to generate question');
      }
    } catch (error) {
      console.error('Error generating question:', error);
      alert('Error generating question');
    } finally {
      setLoading(false);
    }
  };

  if (!config?.configured) {
    return (
      <div className="question-panel">
        <p className="info-message">Please configure your LLM settings first.</p>
      </div>
    );
  }

  return (
    <div className="question-panel">
      {currentQuestion ? (
        <div>
          <h3>Current Interview Question:</h3>
          <div className="question-box">
            {currentQuestion.question}
          </div>

          <div className="answer-section">
            <label>Your Response:</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Share your thoughts, experiences, and memories..."
              className="answer-textarea"
              rows="6"
            />
            <button 
              onClick={handleAnswerSubmit}
              disabled={loading || !answer.trim()}
              className="primary-button"
            >
              {loading ? 'Saving...' : 'Save Response'}
            </button>
          </div>

          <div className="question-actions">
            <button 
              onClick={() => handleGenerateQuestion()}
              disabled={loading}
              className="secondary-button"
            >
              Generate New Question
            </button>
            
            <div className="prompt-question-section">
              <button 
                onClick={() => setShowPromptInput(!showPromptInput)}
                className="link-button"
                disabled={loading}
              >
                Ask about specific topic
              </button>

              {showPromptInput && (
                <div className="prompt-input">
                  <input
                    type="text"
                    value={questionPrompt}
                    onChange={(e) => setQuestionPrompt(e.target.value)}
                    placeholder="e.g., 'ask me about my paperclip collection' or 'my college years'"
                    className="prompt-question-input"
                  />
                  <button 
                    onClick={() => handleGenerateQuestion(false, true)}
                    disabled={loading || !questionPrompt.trim()}
                    className="primary-button small"
                  >
                    Generate Question
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="no-question">
          <h3>Ready to Begin Your Interview</h3>
          <p>Let's start building your life story with thoughtful questions.</p>
          
          <div className="question-generation">
            <button 
              onClick={() => handleGenerateQuestion()}
              disabled={loading}
              className="primary-button large"
            >
              {loading ? 'Generating...' : 'Start Interview'}
            </button>

            <div className="custom-question-section">
              <button 
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="link-button"
              >
                Or ask yourself a specific question
              </button>

              {showCustomInput && (
                <div className="custom-input">
                  <textarea
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Enter a specific question you'd like to explore..."
                    className="custom-question-input"
                    rows="3"
                  />
                  <button 
                    onClick={() => handleGenerateQuestion(true)}
                    disabled={loading || !customQuestion.trim()}
                    className="primary-button"
                  >
                    Use This Question
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Q&A History Component
const QAHistory = ({ qaHistory, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ question: '', answer: '' });

  const startEdit = (qa) => {
    setEditingId(qa.id);
    setEditData({ question: qa.question, answer: qa.answer || '' });
  };

  const handleSave = async (qa) => {
    try {
      const response = await fetch(`${API_BASE_URL}/qa/${qa.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editData.question,
          answer: editData.answer
        }),
      });

      if (response.ok) {
        onUpdate();
        setEditingId(null);
        setEditData({ question: '', answer: '' });
      } else {
        alert('Failed to update Q&A');
      }
    } catch (error) {
      console.error('Error updating Q&A:', error);
      alert('Error updating Q&A');
    }
  };

  const handleDelete = async (qa) => {
    if (window.confirm('Are you sure you want to delete this Q&A pair?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/qa/${qa.id}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          onDelete();
        } else {
          alert('Failed to delete Q&A');
        }
      } catch (error) {
        console.error('Error deleting Q&A:', error);
        alert('Error deleting Q&A');
      }
    }
  };

  return (
    <div className="qa-history">
      <h3>Interview History ({qaHistory.length} questions)</h3>
      
      {qaHistory.length === 0 ? (
        <p className="no-history">No questions answered yet. Start by conducting your first interview!</p>
      ) : (
        <div className="qa-list">
          {qaHistory.map((qa) => (
            <div key={qa.id} className="qa-item">
              {editingId === qa.id ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>Question:</label>
                    <textarea
                      value={editData.question}
                      onChange={(e) => setEditData({ ...editData, question: e.target.value })}
                      className="edit-textarea"
                      rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label>Answer:</label>
                    <textarea
                      value={editData.answer}
                      onChange={(e) => setEditData({ ...editData, answer: e.target.value })}
                      className="edit-textarea"
                      rows="4"
                    />
                  </div>
                  <div className="edit-actions">
                    <button onClick={() => handleSave(qa)} className="primary-button small">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="secondary-button small">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="qa-header">
                    <span className="qa-date">
                      {new Date(qa.timestamp).toLocaleDateString()}
                    </span>
                    {qa.is_custom && <span className="custom-badge">Custom</span>}
                  </div>
                  
                  <div className="qa-question">
                    <strong>Q:</strong> {qa.question}
                  </div>
                  
                  <div className="qa-answer">
                    <strong>A:</strong> {qa.answer || <em>Not answered yet</em>}
                  </div>

                  <div className="qa-actions">
                    <button onClick={() => startEdit(qa)} className="link-button">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(qa)} className="link-button delete">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  const [config, setConfig] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [qaHistory, setQaHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('interview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load LLM config
      const configResponse = await fetch(`${API_BASE_URL}/config/llm`);
      const configData = await configResponse.json();
      setConfig(configData);

      // Load Q&A history
      await loadQAHistory();

      // Load current unanswered question
      await loadCurrentQuestion();
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQAHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/qa`);
      const data = await response.json();
      setQaHistory(data.qa_pairs);
    } catch (error) {
      console.error('Error loading Q&A history:', error);
    }
  };

  const loadCurrentQuestion = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/qa`);
      const data = await response.json();
      
      // Find the most recent unanswered question
      const unanswered = data.qa_pairs.find(qa => !qa.answer);
      setCurrentQuestion(unanswered || null);
    } catch (error) {
      console.error('Error loading current question:', error);
    }
  };

  const handleConfigUpdate = (newConfig) => {
    setConfig(newConfig);
  };

  const handleNewQuestion = (questionData) => {
    setCurrentQuestion(questionData);
    loadQAHistory(); // Refresh history
    // Refresh config stats if needed
    if (activeTab === 'config') {
      setConfig(prev => ({ ...prev, _refresh: Date.now() }));
    }
  };

  const handleAnswerSubmit = () => {
    setCurrentQuestion(null);
    loadQAHistory(); // Refresh history
    // Refresh config stats if needed
    if (activeTab === 'config') {
      setConfig(prev => ({ ...prev, _refresh: Date.now() }));
    }
  };

  const handleHistoryUpdate = () => {
    loadQAHistory();
    loadCurrentQuestion();
    // Refresh config panel if it's active to update database stats
    if (activeTab === 'config') {
      // Force refresh of the config panel by updating a state
      setConfig(prev => ({ ...prev, _refresh: Date.now() }));
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>📖 Biographer AI</h1>
        <p>Creating your life story through intelligent interviews</p>
      </header>

      <nav className="app-nav">
        <button 
          className={`nav-tab ${activeTab === 'interview' ? 'active' : ''}`}
          onClick={() => setActiveTab('interview')}
        >
          Interview
        </button>
        <button 
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Interview History
        </button>
        <button 
          className={`nav-tab ${activeTab === 'biography' ? 'active' : ''}`}
          onClick={() => setActiveTab('biography')}
        >
          Biography
        </button>
        <button 
          className={`nav-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'interview' && (
          <QuestionPanel
            currentQuestion={currentQuestion}
            onAnswerSubmit={handleAnswerSubmit}
            onNewQuestion={handleNewQuestion}
            config={config}
          />
        )}

        {activeTab === 'history' && (
          <QAHistory
            qaHistory={qaHistory}
            onUpdate={handleHistoryUpdate}
            onDelete={handleHistoryUpdate}
          />
        )}

        {activeTab === 'biography' && (
          <Biography
            config={config}
          />
        )}

        {activeTab === 'config' && (
          <ConfigPanel
            config={config}
            onConfigUpdate={handleConfigUpdate}
          />
        )}
      </main>
    </div>
  );
};

export default App;