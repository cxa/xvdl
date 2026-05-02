cask "xvdl" do
  version "260502.0"
  sha256 "6ceb4081c5e3a83678568dacfe3bb50c7a0fc55027f5684a91051d845ddd8edb"

  url "https://github.com/cxa/xvdl/releases/download/v#{version}/XVDL-#{version}-macos.zip"
  name "XVDL"
  desc "Safari Web Extension for downloading videos from X/Twitter posts"
  homepage "https://github.com/cxa/xvdl"

  depends_on macos: ">= :sequoia"

  app "XVDL.app"

  uninstall quit: "com.realazy.xvdl"

  zap trash: [
    "~/Library/Containers/com.realazy.xvdl",
    "~/Library/Containers/com.realazy.xvdl.Extension",
  ]

  caveats do
    <<~EOS
      Open XVDL once after installation, then enable it in Safari > Settings > Extensions.
      Grant website access for x.com and twitter.com.
    EOS
  end
end
