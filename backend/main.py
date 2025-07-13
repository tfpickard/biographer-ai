#!/usr/bin/env python3
"""
Biographer AI Backend
A FastAPI application that generates biographical questions using LLMs
and stores Q&A pairs for building an exhaustive autobiography.
"""

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List
import sqlite3
import json
import asyncio
import aiohttp
from datetime import datetime
import os
import uvicorn
import tempfile
import shutil

app = FastAPI(title="Biographer AI", version="1.0.0")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
DB_PATH = "biographer.db"

def init_db():
    """Initialize the SQLite database with required tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qa_pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_custom BOOLEAN DEFAULT FALSE,
            category TEXT,
            metadata TEXT
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS llm_config (
            id INTEGER PRIMARY KEY,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS biography (
            id INTEGER PRIMARY KEY,
            outline TEXT,
            full_text TEXT,
            outline_updated DATETIME,
            text_updated DATETIME,
            word_count INTEGER DEFAULT 0
        )
    """)
    
    conn.commit()
    conn.close()

# Pydantic models
class LLMConfig(BaseModel):
    provider: str = Field(..., description="LLM provider: chatgpt, claude, or openrouter")
    model: str = Field(..., description="Specific model name")
    api_key: str = Field(..., description="API key for the provider")

class QAPair(BaseModel):
    id: Optional[int] = None
    question: str
    answer: Optional[str] = None
    timestamp: Optional[datetime] = None
    is_custom: bool = False
    category: Optional[str] = None

class QuestionRequest(BaseModel):
    custom_question: Optional[str] = None
    question_prompt: Optional[str] = None

class AnswerRequest(BaseModel):
    qa_id: int
    answer: str

class BiographyOutline(BaseModel):
    outline: str

class BiographyGeneration(BaseModel):
    generate_full_text: bool = True

# LLM Provider configurations
LLM_MODELS = {
    "chatgpt": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo"
    ],
    "claude": [
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307"
    ],
    "openrouter": [
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-4o",
        "openai/gpt-4-turbo",
        "openai/gpt-4",
        "meta-llama/llama-3.1-405b-instruct"
    ]
}

# Database helper functions
def get_db_connection():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_llm_config():
    """Retrieve current LLM configuration."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_config WHERE id = 1")
    config = cursor.fetchone()
    conn.close()
    return dict(config) if config else None

def get_all_qa_pairs():
    """Retrieve all Q&A pairs from database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_pairs ORDER BY timestamp DESC")
    pairs = cursor.fetchall()
    conn.close()
    return [dict(pair) for pair in pairs]

def get_biography():
    """Get current biography outline and text."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM biography WHERE id = 1")
    biography = cursor.fetchone()
    conn.close()
    return dict(biography) if biography else None

def save_biography_outline(outline: str):
    """Save biography outline to database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO biography (id, outline, outline_updated)
        VALUES (1, ?, CURRENT_TIMESTAMP)
    """, (outline,))
    conn.commit()
    conn.close()

def save_biography_text(text: str):
    """Save biography text to database."""
    word_count = len(text.split())
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE biography SET full_text = ?, text_updated = CURRENT_TIMESTAMP, word_count = ?
        WHERE id = 1
    """, (text, word_count))
    
    # If no row exists, create one
    if cursor.rowcount == 0:
        cursor.execute("""
            INSERT INTO biography (id, full_text, text_updated, word_count)
            VALUES (1, ?, CURRENT_TIMESTAMP, ?)
        """, (text, word_count))
    
    conn.commit()
    conn.close()

# LLM Integration
async def call_chatgpt(prompt: str, config: dict) -> str:
    """Call ChatGPT API."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json"
    }
    data = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2000,
        "temperature": 0.7
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="ChatGPT API call failed")
            result = await response.json()
            return result["choices"][0]["message"]["content"].strip()

async def call_claude(prompt: str, config: dict) -> str:
    """Call Claude API."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": config["api_key"],
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
    }
    data = {
        "model": config["model"],
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}]
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="Claude API call failed")
            result = await response.json()
            return result["content"][0]["text"].strip()

async def call_openrouter(prompt: str, config: dict) -> str:
    """Call OpenRouter API."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json"
    }
    data = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 2000,
        "temperature": 0.7
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="OpenRouter API call failed")
            result = await response.json()
            return result["choices"][0]["message"]["content"].strip()

async def generate_question_with_llm(existing_qa_pairs: List[dict], topic_prompt: str = None) -> str:
    """Generate a new biographical question using the configured LLM."""
    config = get_llm_config()
    if not config:
        raise HTTPException(status_code=400, detail="LLM not configured")
    
    # Create context from existing Q&A pairs
    qa_context = ""
    if existing_qa_pairs:
        qa_context = "Previous questions and answers:\n"
        for pair in existing_qa_pairs[-10:]:  # Last 10 Q&A pairs for context
            qa_context += f"Q: {pair['question']}\n"
            if pair['answer']:
                qa_context += f"A: {pair['answer']}\n\n"
    
    # Add topic prompt if provided
    topic_instruction = ""
    if topic_prompt:
        topic_instruction = f"\nSPECIFIC TOPIC REQUEST: The user wants you to ask a question about: {topic_prompt}\n"
    
    prompt = f"""You are an expert biographer tasked with creating an exhaustive, authoritative autobiography. 
    
{qa_context}{topic_instruction}

Based on the previous questions and answers (if any), generate ONE thoughtful, specific biographical question that would help build a comprehensive life story. 

The question should:
- Be open-ended and encourage detailed responses
- Explore different aspects of life (childhood, education, relationships, career, beliefs, experiences, etc.)
- Build naturally on previous answers when possible
- Avoid redundancy with already-asked questions
- Be personally meaningful and likely to reveal important details
{f"- Focus specifically on the requested topic: {topic_prompt}" if topic_prompt else ""}

Return only the question, without any additional text or formatting."""

    # Call appropriate LLM
    if config["provider"] == "chatgpt":
        return await call_chatgpt(prompt, config)
    elif config["provider"] == "claude":
        return await call_claude(prompt, config)
    elif config["provider"] == "openrouter":
        return await call_openrouter(prompt, config)
    else:
        raise HTTPException(status_code=400, detail="Unsupported LLM provider")

async def generate_biography_outline_with_llm(qa_pairs: List[dict]) -> str:
    """Generate a biography outline based on all Q&A pairs."""
    config = get_llm_config()
    if not config:
        raise HTTPException(status_code=400, detail="LLM not configured")
    
    if not qa_pairs:
        return "No interview data available yet. Complete some interview questions first."
    
    # Create context from all answered Q&A pairs
    qa_context = "Interview Data:\n"
    answered_pairs = [pair for pair in qa_pairs if pair['answer']]
    
    for pair in answered_pairs:
        qa_context += f"Q: {pair['question']}\n"
        qa_context += f"A: {pair['answer']}\n\n"
    
    prompt = f"""Based on the following interview data, create a comprehensive outline for an autobiography. The outline should organize the person's life story into logical chapters and sections that would make for a compelling, complete biography.

{qa_context}

Create a detailed outline that includes:
- Major life phases/chapters (childhood, education, career, relationships, etc.)
- Key themes and experiences that emerge from the interviews
- Significant events, turning points, and milestones
- Personal growth, challenges overcome, and lessons learned
- A logical narrative flow that would engage readers

Format the outline with clear chapter headings and bullet points for major topics within each chapter. Make it comprehensive enough to guide the writing of a full autobiography, but concise enough to be easily reviewed and edited.

Return only the outline, without any additional commentary."""

    # Call appropriate LLM
    if config["provider"] == "chatgpt":
        return await call_chatgpt(prompt, config)
    elif config["provider"] == "claude":
        return await call_claude(prompt, config)
    elif config["provider"] == "openrouter":
        return await call_openrouter(prompt, config)
    else:
        raise HTTPException(status_code=400, detail="Unsupported LLM provider")

async def generate_biography_text_with_llm(qa_pairs: List[dict], outline: str) -> str:
    """Generate full biography text based on Q&A pairs and outline."""
    config = get_llm_config()
    if not config:
        raise HTTPException(status_code=400, detail="LLM not configured")
    
    if not qa_pairs:
        return "No interview data available yet. Complete some interview questions first."
    
    # Create context from all answered Q&A pairs
    qa_context = "Interview Data:\n"
    answered_pairs = [pair for pair in qa_pairs if pair['answer']]
    
    for pair in answered_pairs:
        qa_context += f"Q: {pair['question']}\n"
        qa_context += f"A: {pair['answer']}\n\n"
    
    prompt = f"""Using the following interview data and outline, write a comprehensive autobiography in first person. The biography should be engaging, well-structured, and capture the person's authentic voice and experiences.

OUTLINE:
{outline}

INTERVIEW DATA:
{qa_context}

Write a complete autobiography that:
- Follows the provided outline structure
- Uses a compelling narrative voice in first person
- Incorporates all relevant details from the interview responses
- Flows naturally from one section to the next
- Includes specific anecdotes, emotions, and personal insights
- Maintains authenticity to the person's actual experiences and voice
- Is well-written and engaging for readers

The biography should be substantial (aim for at least 2000 words) and comprehensive. Use the interview responses as the primary source material, expanding them into full narrative form while staying true to the facts and tone provided."""

    # Call appropriate LLM
    if config["provider"] == "chatgpt":
        return await call_chatgpt(prompt, config)
    elif config["provider"] == "claude":
        return await call_claude(prompt, config)
    elif config["provider"] == "openrouter":
        return await call_openrouter(prompt, config)
    else:
        raise HTTPException(status_code=400, detail="Unsupported LLM provider")

# API Endpoints
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "Biographer AI Backend Running"}

@app.get("/models/{provider}")
async def get_models(provider: str):
    """Get available models for a provider."""
    if provider not in LLM_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    return {"models": LLM_MODELS[provider]}

@app.post("/config/llm")
async def set_llm_config(config: LLMConfig):
    """Configure LLM provider and model."""
    print(f"Received config: provider={config.provider}, model={config.model}")
    print(f"Available providers: {list(LLM_MODELS.keys())}")
    print(f"Available models for {config.provider}: {LLM_MODELS.get(config.provider, [])}")
    
    if config.provider not in LLM_MODELS:
        print(f"ERROR: Unsupported provider: {config.provider}")
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {config.provider}")
    
    if config.model not in LLM_MODELS[config.provider]:
        print(f"ERROR: Unsupported model {config.model} for provider {config.provider}")
        print(f"Available models: {LLM_MODELS[config.provider]}")
        raise HTTPException(status_code=400, detail=f"Unsupported model {config.model} for provider {config.provider}")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO llm_config (id, provider, model, api_key)
            VALUES (1, ?, ?, ?)
        """, (config.provider, config.model, config.api_key))
        conn.commit()
        conn.close()
        print("Config saved successfully")
        return {"message": "LLM configuration saved"}
    except Exception as e:
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/config/llm")
async def get_current_llm_config():
    """Get current LLM configuration (without API key)."""
    config = get_llm_config()
    if config:
        return {
            "provider": config["provider"],
            "model": config["model"],
            "configured": True
        }
    return {"configured": False}

@app.post("/question/generate")
async def generate_question(request: QuestionRequest = None):
    """Generate a new biographical question."""
    if request and request.custom_question:
        # User provided custom question
        question = request.custom_question.strip()
        is_custom = True
    elif request and request.question_prompt:
        # Generate question using LLM with specific topic prompt
        existing_pairs = get_all_qa_pairs()
        question = await generate_question_with_llm(existing_pairs, request.question_prompt.strip())
        is_custom = False
    else:
        # Generate question using LLM
        existing_pairs = get_all_qa_pairs()
        question = await generate_question_with_llm(existing_pairs)
        is_custom = False
    
    # Store question in database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO qa_pairs (question, is_custom)
        VALUES (?, ?)
    """, (question, is_custom))
    qa_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "id": qa_id,
        "question": question,
        "is_custom": is_custom
    }

@app.post("/answer")
async def submit_answer(request: AnswerRequest):
    """Submit an answer to a question."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE qa_pairs SET answer = ? WHERE id = ?
    """, (request.answer, request.qa_id))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found")
    
    conn.commit()
    conn.close()
    
    return {"message": "Answer saved"}

@app.get("/qa")
async def get_qa_pairs():
    """Get all Q&A pairs."""
    pairs = get_all_qa_pairs()
    return {"qa_pairs": pairs}

@app.put("/qa/{qa_id}")
async def update_qa_pair(qa_id: int, qa_pair: QAPair):
    """Update a Q&A pair."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE qa_pairs 
        SET question = ?, answer = ?, category = ?
        WHERE id = ?
    """, (qa_pair.question, qa_pair.answer, qa_pair.category, qa_id))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    conn.commit()
    conn.close()
    
    return {"message": "Q&A pair updated"}

@app.delete("/qa/{qa_id}")
async def delete_qa_pair(qa_id: int):
    """Delete a Q&A pair."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM qa_pairs WHERE id = ?", (qa_id,))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    conn.commit()
    conn.close()
    
    return {"message": "Q&A pair deleted"}

@app.get("/biography")
async def get_biography_data():
    """Get current biography outline and text."""
    biography = get_biography()
    if not biography:
        return {
            "outline": None,
            "full_text": None,
            "outline_updated": None,
            "text_updated": None,
            "word_count": 0
        }
    return biography

@app.post("/biography/outline/generate")
async def generate_outline():
    """Generate biography outline from interview data."""
    qa_pairs = get_all_qa_pairs()
    outline = await generate_biography_outline_with_llm(qa_pairs)
    save_biography_outline(outline)
    return {"outline": outline}

@app.put("/biography/outline")
async def update_outline(outline_data: BiographyOutline):
    """Update biography outline."""
    save_biography_outline(outline_data.outline)
    return {"message": "Outline updated"}

@app.post("/biography/generate")
async def generate_full_biography():
    """Generate full biography text from interview data and outline."""
    qa_pairs = get_all_qa_pairs()
    biography = get_biography()
    
    if not biography or not biography.get('outline'):
        # Generate outline first if it doesn't exist
        outline = await generate_biography_outline_with_llm(qa_pairs)
        save_biography_outline(outline)
    else:
        outline = biography['outline']
    
    full_text = await generate_biography_text_with_llm(qa_pairs, outline)
    save_biography_text(full_text)
    
    return {
        "full_text": full_text,
        "word_count": len(full_text.split())
    }

@app.get("/database/export")
async def export_database():
    """Export the entire database as JSON."""
    try:
        # Get all data
        qa_pairs = get_all_qa_pairs()
        biography = get_biography()
        config = get_llm_config()
        
        # Remove sensitive data
        if config:
            config.pop('api_key', None)
        
        export_data = {
            "export_date": datetime.now().isoformat(),
            "qa_pairs": qa_pairs,
            "biography": biography,
            "config": config
        }
        
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(export_data, f, indent=2, default=str)
            temp_path = f.name
        
        return FileResponse(
            temp_path,
            media_type='application/json',
            filename=f"biographer_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@app.post("/database/import")
async def import_database(import_data: dict):
    """Import database from JSON data."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Clear existing data
        cursor.execute("DELETE FROM qa_pairs")
        cursor.execute("DELETE FROM biography")
        # Don't delete LLM config as it contains API keys
        
        # Import Q&A pairs
        if "qa_pairs" in import_data:
            for qa in import_data["qa_pairs"]:
                cursor.execute("""
                    INSERT INTO qa_pairs (question, answer, timestamp, is_custom, category, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    qa.get("question"),
                    qa.get("answer"),
                    qa.get("timestamp"),
                    qa.get("is_custom", False),
                    qa.get("category"),
                    qa.get("metadata")
                ))
        
        # Import biography
        if "biography" in import_data and import_data["biography"]:
            bio = import_data["biography"]
            cursor.execute("""
                INSERT OR REPLACE INTO biography 
                (id, outline, full_text, outline_updated, text_updated, word_count)
                VALUES (1, ?, ?, ?, ?, ?)
            """, (
                bio.get("outline"),
                bio.get("full_text"),
                bio.get("outline_updated"),
                bio.get("text_updated"),
                bio.get("word_count", 0)
            ))
        
        conn.commit()
        conn.close()
        
        return {"message": "Database imported successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@app.delete("/database/clear")
async def clear_database():
    """Clear all data from the database (except LLM config)."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM qa_pairs")
        cursor.execute("DELETE FROM biography")
        
        conn.commit()
        conn.close()
        
        return {"message": "Database cleared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Clear failed: {str(e)}")

@app.get("/database/stats")
async def get_database_stats():
    """Get database statistics."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM qa_pairs")
        total_questions = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM qa_pairs WHERE answer IS NOT NULL AND answer != ''")
        answered_questions = cursor.fetchone()[0]
        
        cursor.execute("SELECT word_count FROM biography WHERE id = 1")
        bio_result = cursor.fetchone()
        bio_word_count = bio_result[0] if bio_result else 0
        
        # Calculate database file size
        db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
        
        conn.close()
        
        return {
            "total_questions": total_questions,
            "answered_questions": answered_questions,
            "unanswered_questions": total_questions - answered_questions,
            "biography_word_count": bio_word_count,
            "database_size_bytes": db_size,
            "database_size_mb": round(db_size / (1024 * 1024), 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stats failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)