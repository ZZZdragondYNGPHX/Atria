$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$voice = $null
$stream = $null
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $voice = New-Object -ComObject SAPI.SpVoice
    $tokens = $voice.GetVoices()
    if ($request.action -eq 'listVoices') {
        $voices = @()
        for ($index = 0; $index -lt $tokens.Count; $index++) {
            $token = $tokens.Item($index)
            $voices += @{ voiceId = $token.Id; name = $token.GetDescription(); language = $token.GetAttribute('Language') }
        }
        @{ voices = $voices } | ConvertTo-Json -Compress -Depth 4
    } elseif ($request.action -eq 'synthesize') {
        $selected = $null
        for ($index = 0; $index -lt $tokens.Count; $index++) {
            $token = $tokens.Item($index)
            if ($token.Id -ceq $request.voiceId) { $selected = $token; break }
        }
        if ($null -eq $selected) { throw 'native_speech_voice_unavailable' }
        if ($request.text -isnot [string] -or $request.text.Length -lt 1 -or $request.text.Length -gt 2048 -or $request.rate -lt -10 -or $request.rate -gt 10 -or $request.volume -lt 0 -or $request.volume -gt 100) {
            throw 'native_speech_request_invalid'
        }
        $output = [System.IO.Path]::GetFullPath($request.outputPath)
        if (-not [System.IO.Path]::IsPathRooted($request.outputPath) -or [System.IO.Path]::GetFileName($output) -cne 'speech.wav' -or -not [System.IO.Path]::GetFileName([System.IO.Path]::GetDirectoryName($output)).StartsWith('atria-sapi-')) {
            throw 'native_speech_request_invalid'
        }
        $voice.Voice = $selected
        $voice.Rate = [int]$request.rate
        $voice.Volume = [int]$request.volume
        $stream = New-Object -ComObject SAPI.SpFileStream
        $stream.Format.Type = 22
        $stream.Open($output, 3, $false)
        $voice.AudioOutputStream = $stream
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        # SVSFIsNotXML: text cannot enable SSML, XML controls or markup parsing.
        [void]$voice.Speak($request.text, 16)
        $timer.Stop()
        $stream.Close()
        @{ voiceId = $selected.Id; voiceName = $selected.GetDescription(); language = $selected.GetAttribute('Language');
            rate = $voice.Rate; volume = $voice.Volume; elapsedMs = $timer.Elapsed.TotalMilliseconds } | ConvertTo-Json -Compress -Depth 3
    } else { throw 'native_speech_request_invalid' }
} catch {
    $code = $_.Exception.Message
    if ($code -notin @('native_speech_voice_unavailable', 'native_speech_request_invalid')) { $code = 'native_speech_provider_failed' }
    @{ error = $code } | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($null -ne $stream) {
        try { $stream.Close() } catch { }
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($stream) } catch { }
    }
    if ($null -ne $voice) {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($voice) } catch { }
    }
}
