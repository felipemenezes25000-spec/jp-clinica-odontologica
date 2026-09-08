# Sintetiza a narração com a voz do Windows.
#
# Recebe um JSON [{ arquivo, texto }] e escreve um WAV por linha. Quem orquestra
# é `gerar-narracao.mjs`; este arquivo só existe porque a síntese de voz do
# Windows (SAPI) só é acessível por .NET, e não pelo Node.
#
# O formato é fixo em 22050 Hz / 16 bits / mono: é o suficiente para voz, e
# mantém a trilha inteira do filme abaixo de 11 MB.

param(
  [Parameter(Mandatory = $true)][string]$Entrada,
  [string]$Voz = "Microsoft Maria Desktop",
  [int]$Velocidade = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$itens = Get-Content -Raw -Path $Entrada -Encoding UTF8 | ConvertFrom-Json

$formato = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  22050,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)

$sintetizador = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $sintetizador.SelectVoice($Voz)
} catch {
  Write-Host "Voz '$Voz' indisponível; usando a padrão do sistema."
}
$sintetizador.Rate = $Velocidade

foreach ($item in $itens) {
  $sintetizador.SetOutputToWaveFile($item.arquivo, $formato)
  $sintetizador.Speak($item.texto)
  $sintetizador.SetOutputToNull()
}

$sintetizador.Dispose()
Write-Host "ok $($itens.Count)"
