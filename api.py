from openai import OpenAI

# Connect to your local Ollama server
client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"  # Required by the SDK, but ignored by Ollama
)

response = client.chat.completions.create(
    model="gemma3:270m",
    messages=[
        {"role": "user", "content": "hi how are you"}
    ]
)

print(response.choices[0].message.content)
